// lib/quiz/questionGenerationCore.ts
//
// Shared question-generation core, extracted from lib/quiz/generateRound.ts
// (the newer, actively-maintained, more bugfixed pipeline) and
// app/host/questions/page.tsx (the older standalone single-round generator).
// Both files used to keep private, independently-drifting copies of this
// logic - this module is the single source of truth for it now. Only the
// pieces that were identical or near-identical between the two files (or
// which one file was simply missing a fix the other already had) live here.
// Each file's own orchestration/retry loop (generateValidatedRound/
// generateAllRounds in generateRound.ts; generate()/topUp()/
// removeAndReplace() in page.tsx) stays local to that file - this module
// intentionally has no opinion on retry budgets, pipelining depth, or UI
// state.
//
// Provenance notes (see the consolidation report for the full list):
// - Sourced from generateRound.ts: Question type, multiTapSuitabilityError,
//   sequenceSuitabilityError, the shared constants, shuffle/
//   normalizeQuestionText/genUid/parseModelJson, resolveAnswerText, callAPI
//   (with its client-side AbortController timeout - page.tsx's callAPI never
//   had one), the full validation pipeline (checkQuestion,
//   checkThemeRelevance, finalQualityCheck, checkRoundBalance,
//   runCombinedValidation, isDuplicateInMemory, duplicateRejectionReason,
//   validateCandidate, memoryText, commitToMemory), the model constants and
//   the AI-concurrency queue, and the entire generateOne prompt-construction
//   pipeline.
// - Sourced from page.tsx instead: questionFingerprint (resolves
//   multiple_choice/multi_tap/sequence letter-answers to real option text,
//   sorts options/multi_tap answers before joining, and special-cases
//   audio/picture) - generateRound.ts's own copy was cruder (raw option
//   join, no letter resolution).

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { persistPixabayImage } from "@/lib/quiz/persistPixabayImage";
import { buildPixabaySearchQuery, selectMatchingPixabayHit } from "@/lib/quiz/pixabayMatch";

// ── Types ────────────────────────────────────────────────────────────────

export type Question = {
  id?: number;
  _uid?: string;
  // Transient, never persisted as a real column (this whole object round-trips
  // through a jsonb column, so extra keys are harmless): set when this
  // question was generated from a recency/news topic, and - if a search
  // verification call succeeded - a short note the validators can use to
  // confirm the fact instead of rejecting it purely because Haiku's own
  // frozen training data doesn't recognise something genuinely recent.
  _recency?: boolean;
  _recencyNote?: string;
  question_text: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  option_e: string | null;
  option_f: string | null;
  correct_answer: string;
  explanation: string;
  difficulty: string;
  round_type: string;
  playback_mode?: string;
  replay_mode?: string;
  fade_in?: boolean;
  fade_out?: boolean;
};

export function multiTapSuitabilityError(q: Pick<Question, "question_text" | "question_type" | "option_a" | "option_b" | "option_c" | "option_d" | "option_e" | "option_f" | "correct_answer">): string | null {
  if (q.question_type !== "multi_tap") return "Question type is not multi_tap";
  const stem = (q.question_text || "").trim().toLowerCase();
  if (!/^(which of (these|the following)|select all|select each|tap all)/.test(stem)) {
    return "Multi Tap must be a genuine select-all category question";
  }
  const options = [q.option_a, q.option_b, q.option_c, q.option_d, q.option_e, q.option_f];
  if (options.some(option => typeof option !== "string" || !option.trim())) return "Multi Tap requires all six options";
  const letters = (q.correct_answer || "").split(",").map(letter => letter.trim().toLowerCase()).filter(Boolean);
  const uniqueLetters = new Set(letters);
  if (uniqueLetters.size < 2) return "Multi Tap requires at least two correct answers";
  if (uniqueLetters.size !== letters.length || letters.some(letter => !["a", "b", "c", "d", "e", "f"].includes(letter))) {
    return "Multi Tap answer key is invalid";
  }
  return null;
}

// Audio questions store an internal "Song Title - Artist Name" style lookup
// string in option_a, but correct_answer must hold only whichever single
// fact question_text actually asks for (just the title, just the artist, or
// just the year) - never both combined. A combined "Artist - Title" answer
// silently fails scoring later: a player who correctly types just the title
// gets marked wrong because the fuzzy-match length-ratio check rejects an
// answer that's too short relative to the (wrongly) longer stored string.
// This caught a real live example: correct_answer "Faithless - Music
// Matters" for "Name this song", rejecting the correct player answer
// "Music Matters".
export function audioAnswerSuitabilityError(q: Pick<Question, "question_type" | "option_a" | "correct_answer">): string | null {
  if (q.question_type !== "audio") return null;
  const answer = (q.correct_answer || "").trim();
  const lookup = (q.option_a || "").trim();
  if (!answer || !lookup || !lookup.includes(" - ")) return null;
  const [lookupPartA, lookupPartB] = lookup.split(" - ").map(s => s.trim().toLowerCase());
  const normalisedAnswer = answer.toLowerCase();
  if (answer.includes(" - ") || (lookupPartA && lookupPartB && normalisedAnswer.includes(lookupPartA) && normalisedAnswer.includes(lookupPartB))) {
    return "Audio correct_answer combines song title and artist together instead of just the single fact asked for";
  }
  return null;
}

export function sequenceSuitabilityError(q: Pick<Question, "question_text" | "question_type" | "option_a" | "option_b" | "option_c" | "option_d" | "correct_answer">): string | null {
  if (q.question_type !== "sequence") return "Question type is not sequence";
  const options = [q.option_a, q.option_b, q.option_c, q.option_d];
  if (options.some(option => typeof option !== "string" || !option.trim())) return "Sequence requires four options";
  if ((q.correct_answer || "").replace(/\s/g, "").toLowerCase() !== "a,b,c,d") return "Sequence source answer must be a,b,c,d";
  const stem = (q.question_text || "").toLowerCase();
  const repeated = options.find(option => option && option.trim().length >= 3 && stem.includes(option.trim().toLowerCase()));
  if (repeated) return "Sequence question must not repeat its option items in the question text";
  return null;
}

export type ValidationStatus = "passed" | "failed" | "not_run" | "not_applicable";
export type ValidationStage = "moderation" | "theme" | "duplicate" | "balance" | "memory" | "quality" | "media";
export type RoundBalanceDetails = {
  candidate_subtopic: string | null;
  candidate_entity: string | null;
  conflict_index: number | null;
  rejection_reason: string;
};
export type ValidationResult = { status: ValidationStatus; note: string; details?: RoundBalanceDetails };
export type ValidationResults = Record<ValidationStage, ValidationResult>;
export type GenerationReportEntry = {
  id: string;
  outcome: "accepted" | "rejected";
  questionText: string;
  questionType: string;
  category: string;
  reason: string;
  stages: ValidationResults;
};
export type CandidateReport = Omit<GenerationReportEntry, "id" | "outcome" | "category" | "reason">;
export type GenerationContext = { error: string; report: CandidateReport };

// ── Constants ────────────────────────────────────────────────────────────

export const MUSIC_TOPICS = ["80s pop","90s pop","2000s pop","2010s and 2020s pop","classic rock","indie and alternative rock","hip hop and rap","R&B and soul","dance and EDM","disco and funk","UK number one hits","US number one hits","movie theme songs","musical theatre songs","one-hit wonders","boy bands and girl groups","singer-songwriters","classic 60s and 70s hits","karaoke classics","current chart hits (last 1-2 years)"];

// A small, permanent "don't use this again" list, separate from the
// per-session/per-round exclusion lists below - those only cover what THIS
// generation run has already produced, so a well-known, obvious fact (Burj
// Khalifa's height, Japan's flag) that got generated last week keeps coming
// back on the next run, sometimes worded just differently enough to slip
// past the trigram-similarity duplicate check. Entries here are always
// included in every prompt's exclusion note, regardless of session, so the
// model steers away from these specific facts on every single generation
// from now on. Add to this list as repeats get reported - there's currently
// no in-app UI for it, so it's a direct code edit (ask for that if you'd
// rather manage it yourself from the host screens).
export const PERMANENT_EXCLUDED_FACTS = [
  "How tall is the Burj Khalifa (world's tallest building)",
  "Which country is this flag from? (Japan)",
  "What is the name of Fred Flintstone's pet dinosaur? (Dino)",
  "Which car brand has a logo featuring a prancing horse? (Ferrari)",
  "Which movie features a character who can see dead people? (The Sixth Sense)",
  "Which comedian played the character David Brent in the original UK version of The Office? (Ricky Gervais)",
  "What is the surname of the chef who created the 'Naked Chef' TV persona? (Oliver / Jamie Oliver)",
];
// A picture-type candidate's photo query is restricted (see generateOne's
// picture instructions) to only: a famous landmark/building, an animal or
// species, a national flag, a well-known food/dish, or a sports venue/
// stadium - because that's what stock photo sites actually carry (no
// logos, celebrities, movie stills, TV characters, artwork). Without its
// own topic pool, picture slots were drawing from the SAME general TOPICS
// list as every other question type - most of which (movies, celebrities,
// logos and brands, video games, reality TV, fashion, royals and politics,
// crime and mystery, awards and records...) are flatly incompatible with
// that whitelist, so a picture candidate's topic mismatched its own allowed
// subject matter more often than not, failed moderation/quality on that
// mismatch, and picture questions barely ever survived to be accepted.
export const PICTURE_TOPICS = ["famous landmarks","world flags","animals and wildlife","iconic buildings","national dishes and cuisine","famous bridges","sports stadiums","big cats and safari animals","dog and cat breeds","famous mountains and natural wonders","tropical destinations","classic desserts and sweets","famous rivers and waterfalls","farm animals","street food dishes"];
export const REGULAR_TYPE_WEIGHTS: [string, number][] = [
  ["multiple_choice", 0.25], ["text_answer", 0.20], ["number", 0.15],
  ["sequence", 0.10], ["picture", 0.20], ["audio", 0.10],
];
export const REQUIRED_REGULAR_TYPES = ["multiple_choice", "text_answer", "number", "picture", "audio"];

export const VARIETY_ANGLES = [
  "from the 1960s or 1970s", "from the 1980s", "from the 1990s", "from the 2000s", "from the 2010s or later",
  "that's a deeper cut, not the most obvious example", "with a British/UK angle", "with a US angle",
  "that's slightly more obscure but still well-known", "involving a lesser-discussed fact about the topic",
  "from a different decade than you'd first think of", "that most people would NOT guess first",
];

// Shared AI concurrency queue. A module-level singleton - the older
// app/host/questions/page.tsx generator used to keep an entirely separate
// copy of this queue (never importing this module), so the two screens'
// concurrent AI calls never actually throttled against each other even
// though both were meant to share one global cap. Now both import this one
// queue, so generation via the standalone Generate Questions page and
// generation via Quiz Plans "Generate All" correctly throttle against each
// other's concurrent AI calls.
export const MAX_AI_CONCURRENCY = 8;
let activeAiRequests = 0;
const aiRequestQueue: Array<() => void> = [];

async function withAiRequestSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeAiRequests >= MAX_AI_CONCURRENCY) {
    await new Promise<void>(resolve => aiRequestQueue.push(resolve));
  }
  activeAiRequests++;
  try {
    return await task();
  } finally {
    activeAiRequests--;
    const next = aiRequestQueue.shift();
    if (next) next();
  }
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function parseModelJson<T>(text: string, container: "object" | "array"): T {
  const trimmed = text.trim();
  const start = container === "array" ? trimmed.indexOf("[") : trimmed.indexOf("{");
  const end = container === "array" ? trimmed.lastIndexOf("]") : trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON " + container + " found in response");
  return JSON.parse(trimmed.slice(start, end + 1)) as T;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function normalizeQuestionText(s: string): string {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

// Generic stems such as "Name this song" and "Which of these are..." are not
// question identities. The playable payload (answer/options/media subject) is
// what distinguishes them. Canonicalise option order so shuffled choices still
// count as the same underlying question. (Sourced from page.tsx - resolves
// multiple_choice/multi_tap/sequence letter-answers to real option text and
// special-cases audio/picture; generateRound.ts's own copy was a cruder raw
// option join with no letter resolution.)
export function questionFingerprint(q: Question): string {
  const type = q.question_type || "unknown";
  const text = normalizeQuestionText(q.question_text);
  const rawOptions = [q.option_a, q.option_b, q.option_c, q.option_d, q.option_e, q.option_f];
  const answerKeys = normalizeQuestionText(q.correct_answer).split(",").map(key => key.trim());
  const keyedTypes = ["multiple_choice", "multi_tap", "sequence"];
  const resolvedAnswers = keyedTypes.includes(type)
    ? answerKeys.map(key => rawOptions["abcdef".indexOf(key)]).filter((value): value is string => Boolean(value)).map(normalizeQuestionText)
    : [normalizeQuestionText(q.correct_answer)];
  if (type === "multiple_choice" || type === "multi_tap") resolvedAnswers.sort();
  const answer = resolvedAnswers.join(",");
  if (type === "audio" || type === "picture") {
    return [type, text, answer].join("|");
  }
  const options = rawOptions
    .filter((value): value is string => Boolean(value))
    .map(normalizeQuestionText)
    .sort();
  return [type, text, answer, ...options].join("|");
}

let uidCounter = 0;
export function genUid(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  uidCounter += 1;
  return "q_" + Date.now().toString(36) + "_" + uidCounter;
}

export function emptyValidationResults(hasTheme: boolean, isMedia: boolean): ValidationResults {
  return {
    moderation: { status: "not_run", note: "" },
    theme: { status: hasTheme ? "not_run" : "not_applicable", note: "" },
    duplicate: { status: "not_run", note: "" },
    balance: { status: "not_run", note: "" },
    memory: { status: "not_run", note: "" },
    quality: { status: "not_run", note: "" },
    media: { status: isMedia ? "not_run" : "not_applicable", note: "" },
  };
}

export function createGenerationContext(type: string, hasTheme: boolean): GenerationContext {
  return {
    error: "",
    report: { questionText: "", questionType: type, stages: emptyValidationResults(hasTheme, type === "picture" || type === "audio") },
  };
}

export function stageLabel(stage: ValidationStage): string {
  const labels: Record<ValidationStage, string> = {
    moderation: "Moderation", theme: "Theme relevance", duplicate: "Duplicate",
    balance: "Round balance", memory: "Permanent memory", quality: "Final quality", media: "Media lookup",
  };
  return labels[stage];
}

// ── Exclusion state (the parallel-safe replacement for page.tsx's refs) ────

export type ExclusionState = {
  used: string[];
  usedFingerprints: Set<string>;
  usedAnswers: string[];
  rejectedFingerprints: Set<string>;
  rejectedTexts: Set<string>;
};

export function emptyExclusionState(): ExclusionState {
  return { used: [], usedFingerprints: new Set(), usedAnswers: [], rejectedFingerprints: new Set(), rejectedTexts: new Set() };
}

// Loads the same permanent all-time history the single-round generator loads
// (rounds table, question_bank, questions library). Must stay all-time/no
// cutoff - a time-windowed version was tried and rejected earlier because it
// let genuinely-repeated questions resurface once they aged past the window.
export async function loadUsedQuestions(): Promise<ExclusionState> {
  const supabase = createSupabaseBrowserClient();
  const [{ data: rounds }, { data: bank }, { data: library }] = await Promise.all([
    supabase.from("rounds").select("questions"),
    supabase.from("question_bank").select("question_text,question_type,option_a,option_b,option_c,option_d,option_e,option_f,correct_answer"),
    supabase.from("questions").select("question_text,question_type,option_a,option_b,option_c,option_d,option_e,option_f,correct_answer"),
  ]);
  const state = emptyExclusionState();
  const remember = (q: Question) => {
    if (q.question_text) state.used.push(q.question_text);
    state.usedFingerprints.add(questionFingerprint(q));
    // Picture/audio questions draw from a deliberately tiny topic pool
    // (PICTURE_TOPICS has only ~15 broad categories - "classic desserts and
    // sweets" realistically only has a handful of visually-distinctive stock
    // photo subjects like tiramisu, baklava, pavlova...), so the model keeps
    // landing on the same iconic answer with slightly different phrasing
    // each time. The exact-text fingerprint above only catches an identical
    // repeat; it missed a second "tiramisu" picture question worded
    // differently. usedAnswers previously only ever got populated from the
    // CURRENT round/session (registerAccepted/broadcastAccept below), never
    // from this all-time history load - so a picture/audio answer already
    // used in a totally different quiz could resurface indefinitely. Only
    // doing this for picture/audio (not every question type) because their
    // small answer-space makes exact-answer reuse a real defect, whereas a
    // text/number/multiple_choice question sharing an answer with another
    // question elsewhere is completely normal and not something to exclude.
    if ((q.question_type === "picture" || q.question_type === "audio")) {
      const answer = resolveAnswerText(q).toLowerCase().trim();
      if (answer) state.usedAnswers.push(answer);
    }
  };
  if (rounds) rounds.forEach((r: { questions: Question[] }) => r.questions?.forEach(remember));
  if (bank) bank.forEach((q) => remember(q as Question));
  if (library) library.forEach((q) => remember(q as Question));
  return state;
}

// A lighter-weight alternative to loadUsedQuestions() for regenerating ONE
// question (the REGENERATE button on a single question, in either the Quiz
// Plan builder or Music Prep). loadUsedQuestions() deliberately fetches the
// entire all-time history across three tables to seed exclusions - correct
// for a full "Generate All" batch, but overkill for swapping a single
// question, where that same full fetch was making the button visibly slow
// to respond, especially as an account's saved-question history grows over
// months of use. The permanent, all-time duplicate catch still happens
// regardless - it's server-side, per-candidate, via check_question_memory
// in isDuplicateInMemory() - so skipping the big client-side preload here
// only means the model's prompt has fewer "don't repeat these" examples
// up front, not that duplicates can slip through unchecked.
export function quickExclusionState(currentRoundQuestions: Record<string, unknown>[]): ExclusionState {
  const state = emptyExclusionState();
  currentRoundQuestions.forEach(q => {
    const text = q.question_text as string | undefined;
    if (text) state.used.push(text);
    state.usedFingerprints.add(questionFingerprint(q as Question));
  });
  return state;
}

export function blacklistRejected(state: ExclusionState, q: Question) {
  const fingerprint = questionFingerprint(q);
  if (fingerprint) state.rejectedFingerprints.add(fingerprint);
  const text = normalizeQuestionText(q.question_text);
  if (text) state.rejectedTexts.add(text);
}

export function registerAccepted(state: ExclusionState, q: Question) {
  state.used = [...state.used, q.question_text];
  state.usedFingerprints.add(questionFingerprint(q));
  const normAnswer = resolveAnswerText(q).toLowerCase().trim();
  if (normAnswer) state.usedAnswers = [...state.usedAnswers, normAnswer];
}

// ── AI calls (same /api/generate-questions server route) ───────────────────

// Sonnet is only actually needed for the creative writing call (the question
// itself) - moderation/quality/balance are simple pass/fail judgment calls on
// content that already exists, which Haiku handles just as reliably for a
// fraction of the per-token cost. Since every candidate triggers 3-4 of
// these calls (1 generation + up to 3 validation checks, each retried on
// failed attempts), and validation was silently the majority of spend, this
// is the single biggest lever on the Anthropic bill without touching output
// quality - the part that actually needs the stronger model is untouched.
export const VALIDATION_MODEL = "claude-haiku-4-5-20251001";
// Final factual/quality judgment needs stronger reasoning than formatting,
// moderation and theme classification. A single consolidated Sonnet check is
// still cheaper than the former three separate validator calls, while avoiding
// confident nonsense such as calling Wimbledon's trophy simply "Venus".
export const FACT_CHECK_MODEL = "claude-sonnet-5";
// Cost-first commercial configuration: Haiku writes the candidate as well as
// validating it. Sonnet produced good questions, but costs twice as much per
// input and output token; the existing moderation, memory, balance and final
// quality gates remain responsible for rejecting any weaker candidate.
export const GENERATION_MODEL = VALIDATION_MODEL;

// The server route already caps itself at 30s (maxDuration) so Vercel can't
// silently kill the function with no response, but nothing on the CLIENT
// side ever gave up on a request that hangs somewhere between here and
// there (a stalled connection, a proxy that swallows the close signal,
// etc). Without this, one stuck fetch holds its AI concurrency slot
// (MAX_AI_CONCURRENCY above) forever, and everything queued behind it -
// every other round, every other question - waits with it indefinitely.
// Observed directly as "Checking question 4 of 5..." sitting frozen for
// 5+ minutes with no error and no progress. 35s gives the server's own 30s
// ceiling a little headroom before the client gives up on it too.
// (page.tsx's own callAPI never had this timeout - moving it here adds this
// protection to the standalone Generate Questions page too, intentionally
// and safely, since it can only ever cause a stuck request to fail faster.)
export const CLIENT_REQUEST_TIMEOUT_MS = 35_000;

export async function callAPI(prompt: string, maxTokens: number = 8000, structuredOutput: boolean = false, webSearch: boolean = false, model?: string, combinedValidation: boolean = false) {
  const res = await withAiRequestSlot(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);
    return fetch("/api/generate-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, maxTokens, structuredOutput, webSearch, model, combinedValidation }),
      signal: controller.signal,
    }).catch(e => {
      if (e instanceof Error && e.name === "AbortError") throw new Error("Request to Anthropic timed out after 35s (no response) - retrying.");
      throw e;
    }).finally(() => clearTimeout(timer));
  });
  const rawText = await res.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error("Our own API route returned non-JSON (status " + res.status + "). Raw body (first 500 chars): " + (rawText || "[EMPTY BODY]").slice(0, 500));
  }
  if (!data?.content) {
    const reason = data?.error?.message || "Unknown API error";
    throw new Error("API error (status " + res.status + "): " + reason);
  }
  const toolResult = data.content.find((block: { type: string; name?: string }) =>
    block.type === "tool_use" && block.name === "return_validation_result"
  ) as { input?: unknown } | undefined;
  if (structuredOutput && toolResult?.input) return JSON.stringify(toolResult.input);
  const text = data.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
  return text.replace(/```json/g, "").replace(/```/g, "").trim();
}

export async function checkQuestion(q: Question, theme: string, recencyNote?: string): Promise<{ ok: boolean; note: string; unavailable?: boolean }> {
  const optionTexts = [q.option_a, q.option_b, q.option_c, q.option_d, q.option_e, q.option_f];
  let answerForCheck: string = q.correct_answer;
  if (q.question_type === "multi_tap") {
    const letters = ["a", "b", "c", "d", "e", "f"];
    const correctTexts = (q.correct_answer || "")
      .split(",")
      .map(s => s.trim().toLowerCase())
      .map(l => optionTexts[letters.indexOf(l)])
      .filter(Boolean);
    if (correctTexts.length) answerForCheck = correctTexts.join(", ");
  }
  const isMedia = q.question_type === "picture" || q.question_type === "audio";
  const labelledContent = {
    Question: q.question_text || "",
    Options: isMedia ? [] : optionTexts.filter(Boolean),
    Answer: answerForCheck || "",
    "Player-visible media": q.question_type === "audio"
      ? "An audio clip is played; no lyric transcript or other content description is supplied to the moderator."
      : q.question_type === "picture"
        ? "An image is shown; no visual-content description is supplied to the moderator."
        : "None",
    "Internal media lookup": isMedia ? (q.option_a || "None") : "None",
    Theme: (theme || "").trim() || "None",
  };
  const prompt =
    "You are a content moderator and factual checker for a commercial quiz night in Dubai, UAE. " +
    "Judge this question independently. Moderate ONLY content actually presented to quiz players: the Question, visible Options, Answer, and any Player-visible media content explicitly described below. " +
    "The Internal media lookup is private metadata. You may use its literal title, artist, subject or work name to identify the answer and check factual correctness, but MUST NOT infer, research or analyse any underlying lyrics, plot, themes, subtext, artist history, character history or other content that is not explicitly presented to players. " +
    "Do NOT reject mainstream commercial songs, films, books or TV programmes solely because the referenced work contains mature themes. Allow well-known commercial music suitable for ordinary radio play and mainstream public venues unless the actual title, question, answer, quoted content, described image or described media presented to players is itself inappropriate. " +
    "Distinguish factual reference from promotion: a neutral factual reference to alcohol or another restricted subject may pass; reject content that promotes, celebrates or encourages restricted activity. " +
    "Reject only when the presented content itself contains genuinely explicit sexual material, crude anatomical language, illegal-drug promotion, pork promotion, religious or LGBTQ+ advocacy or sensitive discussion, Iran or Israel political content, hate speech, slurs, harassment, discriminatory content, graphic violence, or other clearly offensive or prohibited material. " +
    "Example that MUST pass: Question 'Name this song.' with Internal media lookup 'Mr. Brightside - The Killers'. Do not analyse the song's lyrics or themes. " +
    "Also verify that the Answer is factually correct for the Question, using the literal reference metadata when needed. Pay special attention to geographic facts (city, country, capital, venue) and named entities - these are common error points, so check them precisely rather than assuming they are right. " +
    (recencyNote
      ? "This question is about a recent/current event that may be AFTER your own training cutoff, so you may not personally recognise it - that is expected and is NOT itself a reason to reject it. A live web search was already run to verify it; treat the following as ground truth for this fact-check: " + recencyNote + " "
      : "") +
    "Reply ONLY with JSON {\"ok\":true,\"note\":\"OK\"} or {\"ok\":false,\"note\":\"short reason based only on presented content\"}. " +
    "Labelled fields: " + JSON.stringify(labelledContent);
  let firstError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await callAPI(prompt, 300, true, false, VALIDATION_MODEL);
      const parsed = parseModelJson<{ ok: boolean; note?: string }>(text, "object");
      return { ok: parsed.ok, note: parsed.note ?? (parsed.ok ? "OK" : "No reason given") };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown moderation error";
      if (attempt === 0) {
        firstError = reason;
        await wait(750);
        continue;
      }
      return { ok: false, unavailable: true, note: "Moderation service unavailable: " + reason + (reason === firstError ? "" : " (first attempt: " + firstError + ")") };
    }
  }
  return { ok: false, unavailable: true, note: "Moderation service unavailable" };
}

export async function checkThemeRelevance(q: Question, activeTheme: string): Promise<{ ok: boolean; note: string }> {
  const options = [q.option_a, q.option_b, q.option_c, q.option_d, q.option_e, q.option_f].filter(Boolean).join(" | ");
  const isMedia = q.question_type === "picture" || q.question_type === "audio";
  const subject = isMedia ? (q.option_a || "") : "";
  const prompt =
    "You are validating whether a pub-quiz question genuinely belongs to the theme \"" + activeTheme + "\". " +
    "A question belongs to the theme ONLY IF answering it REQUIRES specific knowledge of " + activeTheme + " AND the correct answer is itself part of " + activeTheme + ". " +
    "Judge ONLY the question and its answer" + (isMedia ? " and the described media subject" : "") + ". IGNORE any explanation entirely - a generic question is NOT made themed by an explanation that merely mentions " + activeTheme + ". " +
    "Decisive test: could a generally-knowledgeable person who knows NOTHING about " + activeTheme + " still answer correctly? If yes, it does NOT belong to the theme - reject it. " +
    "Example: theme 'Disney', question 'What animal is this?', answer 'Chameleon' => REJECT (a chameleon is a real animal; no Disney knowledge is required, even if an explanation mentions Pascal from Tangled). " +
    "Reply ONLY with JSON {\"ok\":true,\"note\":\"OK\"} or {\"ok\":false,\"note\":\"reason\"}. " +
    "Theme: " + activeTheme + " | Question: " + (q.question_text || "") + " | Answer(key): " + (q.correct_answer || "") +
    (options ? " | Options: " + options : "") +
    (subject ? " | Media subject (internal search query, not shown to players): " + subject : "");
  try {
    const text = await callAPI(prompt, 300, true, false, VALIDATION_MODEL);
    return parseModelJson<{ ok: boolean; note: string }>(text, "object");
  } catch {
    return { ok: true, note: "theme-check-unavailable" };
  }
}

export function resolveAnswerText(q: Question): string {
  const map: Record<string, string | null> = { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d, e: q.option_e, f: q.option_f };
  const key = (q.correct_answer || "").trim().toLowerCase();
  if (q.question_type === "multiple_choice") return map[key] || q.correct_answer;
  if (q.question_type === "multi_tap" || q.question_type === "sequence") {
    const parts = key.split(",").map(s => s.trim()).map(l => map[l]).filter(Boolean) as string[];
    return parts.length ? parts.join(", ") : q.correct_answer;
  }
  return q.correct_answer;
}

export async function finalQualityCheck(q: Question, theme: string, recencyNote?: string): Promise<{ ok: boolean; note: string }> {
  const resolvedAnswer = resolveAnswerText(q);
  const options = [q.option_a, q.option_b, q.option_c, q.option_d, q.option_e, q.option_f].filter(Boolean).join(" | ");
  const isMedia = q.question_type === "picture" || q.question_type === "audio";
  const subject = isMedia ? (q.option_a || "") : "";
  const activeTheme = (theme || "").trim();
  const prompt =
    "You are an experienced professional pub quiz host performing FINAL quality control on ONE question before it goes live. " +
    "Ask yourself: \"Would an experienced professional quiz host WILLINGLY use this EXACT question in a live pub quiz?\" Pass ONLY if the answer is an unequivocal YES. " +
    "Reject (ok:false) if it suffers from ANY of: (1) unnatural wording; (2) awkward grammar; (3) artificially restricted answers; (4) an answer that is technically correct but not what a player would naturally type; (5) it depends on the explanation to make sense; (6) trivial or pointless; (7) poor quiz design; (8) misleading; (9) a generic question disguised as themed; (10) an image that does not directly represent the answer; (11) it gives the answer away; (12) it could reasonably have multiple correct answers; (13) it requires excessive interpretation; (14) it doesn't feel enjoyable to play; (15) anything a competent quiz writer would immediately rewrite. " +
    "Examples that MUST fail: Text Answer 'In which movie does a boy say \"I see dead people\"?' answer 'Sixth' (nobody naturally types 'Sixth'). 'What trophy is awarded to the winner of Wimbledon?' answer 'Venus' (factually wrong, truncated, and ambiguous between events: women receive the Venus Rosewater Dish; men receive the Gentlemen's Singles Trophy). Number 'How many teams are in the Premier League? To the nearest 5' (the 'nearest 5' is pointless). A picture of a real bear asking 'What animal is Yogi Bear?' (the image gives away 'bear'). Disney-themed 'What animal is this?' over a real chameleon (not actually a Disney question). " +
    "Judge the question exactly as a player would experience it. DO NOT rely on the explanation to make it make sense. " +
    (recencyNote
      ? "This question is about a recent/current event you may not personally recognise (it may post-date your training) - do not judge it unnatural or reject it purely for unfamiliarity. A live web search already verified: " + recencyNote + " "
      : "") +
    "Reply ONLY with JSON {\"ok\":true,\"note\":\"OK\"} or {\"ok\":false,\"note\":\"short reason\"}. " +
    "Type: " + q.question_type + " | Theme: " + (activeTheme || "none") +
    " | Question: " + (q.question_text || "") +
    " | Answer a player would type: " + (resolvedAnswer || "") +
    (options ? " | Options: " + options : "") +
    (subject ? " | Image/Audio subject (internal search query, not shown to players): " + subject : "");
  try {
    const text = await callAPI(prompt, 300, true, false, FACT_CHECK_MODEL);
    return parseModelJson<{ ok: boolean; note: string }>(text, "object");
  } catch {
    return { ok: true, note: "quality-check-unavailable" };
  }
}

export async function generateOne(
  type: string,
  topic: string,
  context: GenerationContext,
  opts: { theme: string; difficulty: string; roundType: string; exclusions: ExclusionState; forceObscure?: boolean; multiTapCorrectCount?: number },
): Promise<Question | null> {
  const { theme, difficulty, roundType, exclusions, forceObscure, multiTapCorrectCount } = opts;
  context.error = "";
  context.report = { questionText: "", questionType: type, stages: emptyValidationResults(Boolean(theme.trim()), type === "picture" || type === "audio") };
  const typeInstructions: Record<string, string> = {
    multi_tap: `multi_tap: this MUST be a genuine SELECT-ALL set-membership question with MULTIPLE correct answers, never an ordinary single-answer trivia question padded to 6 choices. Begin question_text with "Which of these..." or "Select all..." and ask which options independently belong to a clearly defined category, have a stated property, or satisfy a condition. BAD and forbidden: "Which country landed on the Moon?", "Which band released American Idiot?", "Who won...?", "What is...?", or any fact that logically has one unique answer. GOOD: "Which of these countries have hosted the Summer Olympics?" or "Select all artists who have won Album of the Year." Exactly 6 options in option_a through option_f, ALL SIX FILLED IN. This question MUST have EXACTLY ${multiTapCorrectCount ?? 3} correct options; the remaining options must be wrong decoys. correct_answer must list exactly those ${multiTapCorrectCount ?? 3} correct option letters, comma-separated and in letter order. Make every decoy plausible, not obviously wrong.`,
    multiple_choice: "multiple_choice: 4 options A/B/C/D, correct_answer is a, b, c, or d",
    text_answer: "text_answer: the correct_answer MUST be a SINGLE word - no spaces, no commas, no \"and\", no \"&\", no \"/\", no multiple names, no multiple items, no hyphen-joined names. If the natural answer would be more than one word, choose a different question whose answer is a single word. All options must be null.",
    number: "number: numeric answer, options null except option_a which has a helpful hint e.g. \"To the nearest 10\"",
    nearest_wins: "nearest_wins: a CLOSEST-GUESS estimation question, not an exact-match trivia question - scoring ranks every team's numeric guess by how close it is to the true number, so the question must genuinely invite a reasoned estimate rather than have a neat, easily-known exact answer. Good subjects: a large or hard-to-know count/measurement/statistic (e.g. \"How many floors does the Burj Khalifa have?\", \"What was the world record for the men's 100m sprint, in seconds?\", \"How many people have walked on the Moon?\"). This type has NO picture, image or any other visual shown to players and NO options of any kind - question_text is the ONLY thing players see, so it must name every subject it refers to explicitly and completely in the text itself. NEVER write \"this\", \"these\", \"this picture\", \"the two shown above\" or any other reference to something unnamed or unseen - for example NEVER write \"How many days separated the original release of these two sugar-free drinks?\"; instead name both drinks outright, e.g. \"How many days separated the original US release of Diet Coke and Coca-Cola Zero?\". Every entity, item, or comparison the question depends on must be spelled out by name in question_text, with nothing left for players to see or infer from elsewhere. correct_answer must be the true number as a plain numeric string with no units, commas, or symbols (e.g. \"163\" not \"163 floors\"). All options (option_a through option_f) must be null - do NOT include a rounding hint like \"to the nearest 10\", since scoring rewards the closest raw guess, not a rounded one. question_text must make clear it wants a specific number as the answer.",
    sequence: "sequence: 4 items that have a definite correct chronological/logical order, written into option_a/b/c/d in that correct order. correct_answer must be exactly \"a,b,c,d\" (the options will be randomized programmatically afterward, so always write them in true correct order here). question_text must state only the ordering rule, such as \"Put these artists in order of when they first topped the global charts, earliest first.\" NEVER repeat, enumerate, or list the four option items in question_text; players must see each item exactly once in the tappable option list.",
    picture: theme.trim()
      ? `picture: create a THEMED picture question for "${theme.trim()}". option_a is a short internal Pixabay search query for a stock-safe REAL subject (landmark/building, animal, flag, food/dish, or stadium); never use logos, people, film stills, characters, album covers or copyrighted artwork. question_text is shown with that image and MUST require specific knowledge of "${theme.trim()}" to answer—the stock image is a meaningful clue, not the answer itself. Example pattern: an image of Neuschwanstein Castle with "This castle inspired the royal home in which Disney film?" Do NOT ask generic identification such as "What animal is this?"; that tests general knowledge rather than the theme. Never write "Show teams this image" or reveal the answer. option_b/c/d null; correct_answer must answer the themed question.`
      : "picture: option_a is a short internal Pixabay query for a stock-safe subject: landmark/building, animal, flag, food/dish, or stadium. Never use logos, famous people, film stills, characters, album covers or copyrighted artwork. question_text must name what KIND of identification is being asked using the specific subject category - e.g. \"Name this landmark\", \"Which country's flag is this?\", \"Which dish is pictured here?\", \"Which stadium is shown?\" - so a landmark question never reads the same as an animal question or a flag question. NEVER use the bare generic forms \"What is this?\" or \"What animal is this?\" with no other detail - every picture question in a round covers a different subject, so its phrasing must be specific enough to that subject's category to not read identically to every other picture question in the same round. Do not name the subject itself or say 'Show teams this image'. option_b/c/d null; correct_answer identifies what is shown.",
    audio: theme.trim()
      ? `audio: create a THEMED music-clip question for "${theme.trim()}". option_a is an internal YouTube search query identifying the exact track, in the form "Song Title - Artist Name" (title and artist both present, for internal lookup only). question_text is shown after the clip and MUST require specific knowledge of "${theme.trim()}"—for example "Which animated film features this song?"—rather than merely naming a song that happens to be associated with the theme. Do not reveal the song, artist or answer. option_b/c/d null; correct_answer must answer the themed question and must contain ONLY the single piece of information the question actually asks for (e.g. just the song title, OR just the artist name, OR just the year) - NEVER combine artist and title together like "Artist - Title" in correct_answer, even though option_a uses that combined form for lookup purposes.`
      : "audio: option_a is an internal YouTube search query identifying the exact track, in the form \"Song Title - Artist Name\" (title and artist both present, for internal lookup only). question_text is a short question answerable from the clip, such as 'Name this song', 'Which artist performs this song?' or 'What year was it released?'. Do not reveal the title or artist. option_b/c/d null; correct_answer must match what question_text asks and must contain ONLY that single piece of information - e.g. if asked to name the song, correct_answer is just the song title with no artist name attached; if asked for the artist, correct_answer is just the artist name with no song title attached. NEVER write correct_answer as \"Artist - Title\" or \"Title - Artist\" - that combined form belongs only in option_a, never in correct_answer.",
  };
  const rejectedList = Array.from(exclusions.rejectedTexts);
  let exclusionsText = [...rejectedList, ...exclusions.used.slice(-25)].map((q, i) => (i + 1) + ". " + q).join("; ");
  if (exclusionsText.length > 1800) exclusionsText = exclusionsText.slice(0, 1800);
  const usedAnswersList = exclusions.usedAnswers.slice(-20).filter(Boolean).join(", ");
  let sessionExclusionNote = (exclusionsText || usedAnswersList)
    ? " Do NOT generate any of these already-used questions: " + exclusionsText + "."
      + (usedAnswersList ? " Also do NOT use any of these already-used answers (even with different question wording): " + usedAnswersList + "." : "")
    : "";
  if (sessionExclusionNote.length > 1200) sessionExclusionNote = sessionExclusionNote.slice(0, 1200);
  const permanentExclusionNote = " Never generate a question about any of these overused facts, worded any way: " + PERMANENT_EXCLUDED_FACTS.join("; ") + ".";
  const RECENCY_SIGNAL = /\bnews\b|current affairs|pop culture|\brecent\b|trending|this year|last year|chart hits|latest hits|new release/i;
  const isRecencyTopic = RECENCY_SIGNAL.test(topic);
  const angle = forceObscure ? "a deeper cut, not the most obvious example - genuinely less commonly asked, while still fair and answerable by a general pub-quiz crowd" : VARIETY_ANGLES[Math.floor(Math.random() * VARIETY_ANGLES.length)];
  const varietyNote = type === "audio"
    ? " IMPORTANT - pick a well-known song: either a genuinely famous track a pub crowd would clap along to, OR any other song (even a deeper cut, B-side, or later single) by a genuinely famous, widely recognised artist/band - the artist being well-known is enough on its own, the specific song does not also have to be their single most famous hit. Not obscure/unknown artists either way. Vary the decade/genre/artist from recent picks."
    : " IMPORTANT - avoid defaulting to the single most famous, first-thought-of example for this topic (e.g. for 'Disney songs' don't always pick Let It Go or Circle of Life). Where possible, lean toward something " + angle + ". Vary your answer choices across different eras, genres, and sub-topics rather than the most obvious pick. " +
      "ALSO vary the QUESTION SENTENCE STRUCTURE itself, not just the topic and answer - do not default to the generic 'Which [brand/company]'s [logo/mascot/product] is/features/has [X]?' template. Mix in different natural phrasings appropriate to the fact: who/what/where/when/how questions, 'In [film/show], who/what...', 'What is the name of...', 'How many...', direct trivia phrasing, etc. Two consecutive questions in the same round should not read like the same template with the nouns swapped.";
  const prompt = `You are writing questions for a LIVE PUB QUIZ at a bar or restaurant. Your audience is adults aged 25-55 having a social night out. This is entertainment, not education.
BEFORE writing any question, ask yourself: "Would 8 friends sitting in a pub enjoy answering this?" If no, do not write it.
FIRST-PASS CHECK (do silently): consider several different facts and entities; reject any that paraphrase an excluded question or reuse its entity, answer or knowledge test; then choose the strongest stable fact with one clear natural answer. Check only player-visible content for venue suitability—unseen plots, lyrics and themes do not make a mainstream work unsuitable.
TOPIC: ${topic}
${roundType === "bonus" ? `BONUS THEME CONTRACT: Every question must directly test the host's theme "${theme || topic}". Use a different fact and subject for each question. Do not drift into movie/music trivia merely associated with the theme. For a colour theme, ask about colours themselves in varied contexts (nature, flags, everyday objects, art or sport), not the name of a film with colourful characters. All text must stand alone: never say "this bird", "this picture" or "this song" without supplied media. Prefer natural, specific questions over tenuous associations.` : ""}
TYPE: ${typeInstructions[type]}
DIFFICULTY: ${difficulty === "easy" ? "EASY - almost everyone in the room should get this right" : difficulty === "hard" ? "HARD - a well-informed pub team might know this, but it is still based on widely-known popular culture or history, never specialist academic knowledge" : "MEDIUM - a mixed group of adults has a fair chance, about half the room gets it right"}
TONE AND STYLE:
- Fun, social, conversational
- Think Kahoot or bar trivia night, not University Challenge
- Questions should feel satisfying and recognisable when answered
- Short question text - a host reads this aloud, keep it under 20 words where possible
- Use plain everyday English, no jargon
WHAT TO WRITE ABOUT (high priority):
Music, movies, TV shows, celebrities, showbiz, football, world geography, famous brands, food and drink, famous landmarks, travel, pop culture, social media, consumer technology, accessible science and space, books, art and culture, simple history, sport, nature and everyday life
WHAT TO NEVER WRITE ABOUT:
Mathematics, advanced or specialist science, medicine, rare diseases, engineering detail, obscure geography, scientific terminology, specialist vocabulary, academic concepts, anything requiring university-level knowledge
STRICT QUALITY RULES (every question must pass all of these):
1. The answer must NOT appear anywhere inside the question text, including inside a show/film/song/book title, brand name, or other proper noun quoted in the question. Never give away or hint at the answer in the question itself. Example that MUST fail: "In which country is the reality show 'MasterChef Australia' filmed and set?" answer "Australia" (the country name is written right there in the show's title) - pick a different fact about the show, or a different question, instead.
2. No words that are difficult to pronounce aloud at speed. A host reads this live to a noisy room.
3. No specialist terminology. If an average person would not know the word, do not use it.
4. Wrong answer options must be plausible. Use well-known alternatives someone might genuinely confuse, not obviously wrong fillers.
5. Every question must be answerable by a reasonably well-informed adult with no specialist training.
6. UAE venue safe: no alcohol references, no pork, no sexual content, no religion, no LGBTQ+ content, no Iran or Israel political references. This is a UAE venue with an international, mostly-expat crowd, NOT a UK pub - do not default to UK-only framing or phrasing ("UK hit", "UK number one", "as seen on British TV", assuming a British reader). Prefer facts and entities that are globally/internationally recognisable (worldwide chart hits, globally famous films/shows/people) over ones that are only well-known in the UK specifically. Frame chart/hit questions in globally neutral terms (e.g. "a global hit" or naming the artist/year) rather than labelling them by a single country's chart unless the topic is explicitly about that country's culture.
7. Use one stable, verifiable fact: nothing disputed, subjective, or invented.${isRecencyTopic
    ? " This question is for the \"" + topic + "\" topic - you have a web_search tool available and MUST use it before writing the question. Search for a genuinely well-known breaking or trending entertainment, showbiz, music, sport, technology or culture headline from roughly the last 1-12 months. Use only a completed, stable fact confirmed by reliable search results; never ask about a developing story, prediction, rumour or detail likely to change. If sources are unclear or conflicting, choose a different story. Never use politics, elections, war, crime, tragedy or disaster."
    : " For current or trending topics only, use well-known, completed entertainment, showbiz, music, sport, technology or culture events confirmed by live search - never politics, developing stories, rumours or facts likely to change."}
8. Wording must allow exactly one defensible, natural answer-not an abbreviation, fragment, trick or technicality.
9. If the correct_answer is a person's name and only part of the full name (surname only, or first name only) will be stored as the answer, the question_text itself must explicitly state which part is required (e.g. "What is the SURNAME of the actress who played Katniss Everdeen?" with correct_answer "Lawrence", or "What is the FIRST NAME of the actor who played Iron Man?" with correct_answer "Robert"). Never ask an ambiguous full-name question and store only a partial name as the answer.
10. The question must stand alone without its explanation and test one satisfying piece of knowledge.
11. Stay on TOPIC but use a genuinely different entity and narrow subtopic from the exclusions.
${varietyNote}${sessionExclusionNote}${permanentExclusionNote}
Include a 1-2 sentence explanation of the answer in the explanation field.
Silently check before writing: one array item, every schema key present, unused options null, exact requested type and answer format. Do not write out that checking process - it must not appear anywhere in your reply.
Your entire reply must be ONLY the JSON array itself - no preamble, no "checking..." notes, no explanation of your reasoning, no markdown, nothing before the opening [ or after the closing ]. The very first character of your reply must be [.
Return ONLY a valid JSON array with 1 item, no markdown:
[{"question_text":"...","question_type":"${type}","option_a":"...","option_b":"...","option_c":"...","option_d":"...","option_e":"...","option_f":"...","correct_answer":"...","explanation":"...","difficulty":"${difficulty}","round_type":"${roundType}"}]`;
  // Never truncate the completed prompt: its final lines contain the JSON
  // contract. Once the quality guidance grew beyond 7,500 characters, the
  // old slice() removed that contract and Haiku returned prose/incomplete
  // JSON, causing every candidate to fail parsing. If the prompt needs
  // shrinking, remove only optional recent-session exclusions; permanent
  // exclusions and the output schema always survive intact.
  const promptWithoutSessionExclusions = prompt.replace(sessionExclusionNote, "");
  // Match the API route's 12k ceiling with headroom for future transport
  // metadata. The complete base instructions are already above the former
  // 8k limit, so targeting 7.9k could not possibly make a valid request.
  const allowedSessionExclusionLength = Math.max(0, 11500 - promptWithoutSessionExclusions.length);
  const safePrompt = prompt.replace(sessionExclusionNote, sessionExclusionNote.slice(0, allowedSessionExclusionLength));
  try {
    const text = await callAPI(safePrompt, 1200, false, isRecencyTopic, GENERATION_MODEL);
    let q;
    try {
      q = parseModelJson<Array<Question & Record<string, unknown>>>(text, "array")[0];
    } catch {
      throw new Error("JSON parse failed. Raw text (first 500 chars): " + text.slice(0, 500));
    }
    if (q) { q.question_type = type; }
    if (q) { context.report.questionText = q.question_text || "Untitled candidate"; }
    if (q && isRecencyTopic) {
      q._recency = true;
      try {
        const verifyPrompt = "Use the web_search tool to verify this pub-quiz question and answer against current, reliable sources. " +
          "Question: " + (q.question_text || "") + " | Stated answer: " + resolveAnswerText(q) + ". " +
          "Reply with ONE short sentence stating either the confirmed correct answer and source context, or that it could not be confirmed. No markdown, no preamble.";
        const verifyText = await callAPI(verifyPrompt, 400, false, true, GENERATION_MODEL);
        if (verifyText && verifyText.trim()) q._recencyNote = verifyText.trim().slice(0, 500);
      } catch {
        // No verification note is fine.
      }
    }
    if (q && theme && theme.trim()) {
      const themeCheck = await checkThemeRelevance(q, theme.trim());
      context.report.stages.theme = { status: themeCheck.ok ? "passed" : "failed", note: themeCheck.note };
      if (!themeCheck.ok) {
        context.error = "Off-theme for '" + theme.trim() + "' (" + themeCheck.note + ") - retrying";
        return null;
      }
    }
    if (q && q.question_type === "audio" && q.option_a) {
      try {
        const ytKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
        const ytRes = await fetch(
          "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=" +
          encodeURIComponent(q.option_a) + "&key=" + ytKey
        );
        const ytData = await ytRes.json();
        const videoId = ytData?.items?.[0]?.id?.videoId;
        if (videoId) {
          q.option_b = "https://www.youtube.com/watch?v=" + videoId;
          context.report.stages.media = { status: "passed", note: "YouTube media found" };
        } else {
          context.report.stages.media = { status: "failed", note: "No YouTube result found" };
          return null;
        }
      } catch {
        context.report.stages.media = { status: "failed", note: "YouTube lookup failed" };
        return null;
      }
    }
    if (q && q.question_type === "picture" && q.option_a) {
      const brandCheck = (q.question_text + " " + q.option_a).toLowerCase();
      if (/\blogo\b|\bbrand\b|\btrademark\b/.test(brandCheck)) {
        context.report.stages.media = { status: "failed", note: "Picture subject requested a logo, brand or trademark" };
        return null;
      }
      try {
        const pixabayKey = process.env.NEXT_PUBLIC_PIXABAY_API_KEY;
        const pixabayQuery = buildPixabaySearchQuery(q.option_a);
        const pixRes = await fetch(
          "https://pixabay.com/api/?key=" + pixabayKey +
          "&q=" + encodeURIComponent(pixabayQuery) +
          "&image_type=photo&per_page=5&safesearch=true"
        );
        const pixData = await pixRes.json();
        const hit = selectMatchingPixabayHit(pixData?.hits || [], q.option_a);
        if (hit) {
          const pixabayUrl = hit.webformatURL || hit.largeImageURL;
          if (!pixabayUrl) {
            context.report.stages.media = { status: "failed", note: "Matched Pixabay result had no usable image URL" };
            return null;
          }
          const persisted = await persistPixabayImage(pixabayUrl);
          q.option_b = persisted.url;
          // If the re-host silently failed, option_b is still a raw Pixabay
          // hotlink - which Pixabay's own terms say not to rely on
          // long-term, and which has been observed going dead over time
          // (see persistPixabayImage.ts). Surface that in the generation
          // report immediately rather than letting it look identical to a
          // durably-hosted image until it breaks, unnoticed, weeks later.
          context.report.stages.media = persisted.persisted
            ? { status: "passed", note: "Pixabay image found and re-hosted" }
            : { status: "passed", note: "Pixabay image found, but re-hosting to permanent storage failed - this image is a temporary Pixabay link and may go dead later. Check /host/question-bank if this photo stops loading." };
        } else {
          context.report.stages.media = { status: "failed", note: "No Pixabay image matched the requested subject" };
          return null;
        }
      } catch {
        context.report.stages.media = { status: "failed", note: "Pixabay lookup failed" };
        return null;
      }
    }
    if (q && q.question_type === "multiple_choice") {
      const letters = ["a", "b", "c", "d"];
      const items = letters.map(l => q["option_" + l]);
      const correctLetter = (q.correct_answer || "").trim().toLowerCase();
      const correctIndex = letters.indexOf(correctLetter);
      const shuffledLetters = shuffle(letters);
      const newOptions: Record<string, unknown> = {};
      let newCorrect = correctLetter;
      shuffledLetters.forEach((destL, i) => {
        newOptions[destL] = items[i];
        if (i === correctIndex) newCorrect = destL;
      });
      letters.forEach(l => { q["option_" + l] = newOptions[l]; });
      q.correct_answer = newCorrect;
    }
    if (q && q.question_type === "audio") {
      const suitabilityError = audioAnswerSuitabilityError(q);
      if (suitabilityError) {
        context.error = suitabilityError + " - retrying";
        return null;
      }
    }
    if (q && q.question_type === "sequence") {
      const suitabilityError = sequenceSuitabilityError(q);
      if (suitabilityError) {
        context.error = suitabilityError + " - retrying";
        return null;
      }
      const letters = ["a", "b", "c", "d"];
      const items = letters.map(l => q["option_" + l]);
      const shuffledLetters = shuffle(letters);
      const newOptions: Record<string, unknown> = {};
      shuffledLetters.forEach((slot, i) => { newOptions[slot] = items[i]; });
      letters.forEach(l => { q["option_" + l] = newOptions[l]; });
      q.correct_answer = shuffledLetters.join(",");
    }
    if (q && q.question_type === "multi_tap") {
      const suitabilityError = multiTapSuitabilityError(q);
      if (suitabilityError) {
        context.error = suitabilityError + " - retrying";
        return null;
      }
      const letters = ["a", "b", "c", "d", "e", "f"];
      const filledPairs = letters
        .map(l => ({ letter: l, value: q["option_" + l] }))
        .filter((p): p is { letter: string; value: string } => p.value !== null && p.value !== undefined && p.value !== "");
      const items = filledPairs.map(p => p.value);
      const correctLetters = (q.correct_answer || "").split(",").map((s: string) => s.trim().toLowerCase());
      if (multiTapCorrectCount && new Set(correctLetters).size !== multiTapCorrectCount) {
        context.error = "Multi Tap required exactly " + multiTapCorrectCount + " correct answers (got " + new Set(correctLetters).size + ") - retrying";
        return null;
      }
      const usedLetters = letters.slice(0, items.length);
      const wasCorrect = filledPairs.map(p => correctLetters.includes(p.letter));
      const shuffledLetters = shuffle(usedLetters);
      const newOptions: Record<string, unknown> = {};
      const newCorrect: string[] = [];
      usedLetters.forEach((_origL, i) => {
        const destL = shuffledLetters[i];
        newOptions[destL] = items[i];
        if (wasCorrect[i]) newCorrect.push(destL);
      });
      letters.forEach(l => { q["option_" + l] = newOptions[l] ?? null; });
      q.correct_answer = newCorrect.sort().join(",");
      const finalKeyLetters = q.correct_answer.split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean);
      const keyValid = finalKeyLetters.length > 0 && finalKeyLetters.every((l: string) => {
        const opt = q["option_" + l];
        return opt !== null && opt !== undefined && opt !== "";
      });
      if (!keyValid) {
        context.error = "Multi Tap answer key invalid ('" + (q.correct_answer || "") + "') - retrying";
        return null;
      }
    }
    if (q && q.question_type === "text_answer") {
      const ans = (q.correct_answer || "").trim();
      const invalid =
        ans === "" ||
        /\s/.test(ans) ||
        ans.includes(",") ||
        ans.includes("&") ||
        ans.includes("/") ||
        /\band\b/i.test(ans) ||
        /[A-Za-z]+-[A-Z][a-zA-Z]*/.test(ans);
      if (invalid) {
        context.error = "Text Answer must be a single word (got '" + ans + "') - retrying";
        return null;
      }
    }
    q._uid = genUid();
    return q;
  } catch (e) {
    context.error = e instanceof Error ? e.message : "Unknown error";
    return null;
  }
}

export function duplicateRejectionReason(q: Question, currentRound: Question[], theme: string, exclusions: ExclusionState): string | null {
  const COMMON = new Set([
    "what","which","where","when","who","that","this","with","from","have","been","were","they","their","about","only","does","into","than","other","more","over","some","also","after","before","known","the","and","for","are","but","not","you","all","can","had","her","him","his","how","man","new","now","old","see","two","way","boy","did","its","let","put","say","she","too","use","was","your","them","then","here","there","was","are",
    "film","films","movie","movies","song","songs","music","character","characters","name","named","names","actor","actress","actors","voice","voiced","played","plays","play","called","feature","features","featured","animated","animation","show","shows","series","episode","famous","first","last","title","titled","released","release","year","years","won","wins","winner","story","stories","franchise","sequel","original","company","brand","team","player","country","city","capital","word","words","number",
  ]);
  const themeTokens = (theme || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const ignore = new Set<string>([...COMMON, ...themeTokens]);
  const sigWords = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 3 && !ignore.has(w));
  const sigPairs = (s: string) => {
    const words = sigWords(s);
    return new Set(words.slice(0, -1).map((word, index) => word + " " + words[index + 1]));
  };
  const normAnswer = resolveAnswerText(q).toLowerCase().trim();
  const fingerprint = questionFingerprint(q);
  if (exclusions.rejectedFingerprints.has(fingerprint)) return "blacklist";
  if (exclusions.usedFingerprints.has(fingerprint)) return "exact-question:used-or-history";
  if (exclusions.used.some(text => normalizeQuestionText(text) === normalizeQuestionText(q.question_text))) return "same-question-text:quiz-or-history";
  if (currentRound.some(g => questionFingerprint(g) === fingerprint)) return "exact-question:current-round";
  if (normAnswer && currentRound.some(g =>
    resolveAnswerText(g).toLowerCase().trim() === normAnswer
  )) return "same-answer:current-round";
  if (normAnswer && exclusions.usedAnswers.includes(normAnswer)) return "same-answer:quiz-plan";
  const newWords = sigWords(q.question_text);
  const newPairs = sigPairs(q.question_text);
  if (newWords.length >= 2) {
    for (const usedText of exclusions.used.slice(-100)) {
      const usedWords = sigWords(usedText);
      if (usedWords.length < 2) continue;
      const usedPairs = sigPairs(usedText);
      if ([...newPairs].some(pair => usedPairs.has(pair))) return "same-primary-entity:quiz-or-history";
      const shared = newWords.filter(w => usedWords.includes(w)).length;
      if (shared >= 2 && shared / Math.min(newWords.length, usedWords.length) >= 0.75) return "same-fact-reworded:quiz-or-history";
    }
    for (const g of currentRound) {
      const existWords = sigWords(g.question_text);
      if (existWords.length < 2) continue;
      const shared = newWords.filter(w => existWords.includes(w)).length;
      if (shared < 2) continue;
      const overlap = shared / Math.min(newWords.length, existWords.length);
      if (overlap >= 0.6) return "near-identical";
    }
  }
  return null;
}

export async function checkRoundBalance(q: Question, currentRound: Question[], theme: string): Promise<{
  ok: boolean;
  note: string;
  details: RoundBalanceDetails;
}> {
  const emptyDetails: RoundBalanceDetails = { candidate_subtopic: null, candidate_entity: null, conflict_index: null, rejection_reason: "" };
  if (currentRound.length === 0) return { ok: true, note: "First accepted question in round", details: emptyDetails };
  const activeTheme = (theme || "").trim();
  const candidate = {
    type: q.question_type,
    question: q.question_text || "",
    answer: resolveAnswerText(q) || "",
    internal_media_lookup: ["picture", "audio"].includes(q.question_type) ? (q.option_a || "None") : "None",
  };
  const accepted = currentRound.map((existing, index) => ({
    index: index + 1,
    type: existing.question_type,
    question: existing.question_text || "",
    answer: resolveAnswerText(existing) || "",
    internal_media_lookup: ["picture", "audio"].includes(existing.question_type) ? (existing.option_a || "None") : "None",
  }));
  const prompt =
    "You are an experienced professional pub-quiz host checking the balance of " + (activeTheme ? `a round themed "${activeTheme}". ` : "an UNTHEMED general-knowledge round. ") +
    "Compare ONE candidate only with the already accepted questions supplied below. Reject only with HIGH confidence when an experienced host would consider the round noticeably repetitive because: (1) the same primary entity appears twice; (2) the same narrow subtopic appears twice; or (3) both questions effectively test the same underlying knowledge - even if the specific fact, clue, or answer is different. " +
    (activeTheme ? `The shared theme "${activeTheme}" is intentional and MUST NOT itself count as repetition. But a broad theme still needs variety inside it: for "kids movies", two questions about Frozen, Shrek, or the same franchise must be rejected. If the theme itself explicitly names one work/entity (for example "Frozen"), allow that named entity but require different characters, scenes, songs, production facts or narrow subtopics. ` : "") +
    "Examples that should be rejected: two tennis questions, two Beatles questions, two volcano questions, or two 'identify this car brand from a clue' questions (e.g. one from its logo, one from its slogan - different facts, but the player's actual task both times is 'name this car brand', which is repetitive even with different answers). " +
    "Allow broad-category overlap such as two different sports or two different music subjects where the actual knowledge being tested differs each time (a football history fact vs a tennis rules fact), not just the same recurring task with a different answer plugged in. Allow incidental or weak relationships. Do NOT reject merely because two questions mention or concern the same country; reject only if they also share a genuinely narrow subtopic, primary entity, or underlying knowledge test. " +
    "Be conservative: uncertainty MUST pass. The candidate must be judged against accepted questions only. conflict_index is the 1-based index of the accepted question it conflicts with, otherwise null. " +
    "Reply ONLY with JSON {\"ok\":true,\"note\":\"No high-confidence round-balance conflict\",\"confidence\":\"low|medium|high\",\"candidate_subtopic\":\"short label or null\",\"candidate_entity\":\"primary entity or null\",\"conflict_index\":null,\"rejection_reason\":\"\"} or {\"ok\":false,\"note\":\"short reason\",\"confidence\":\"high\",\"candidate_subtopic\":\"short label\",\"candidate_entity\":\"primary entity or null\",\"conflict_index\":1,\"rejection_reason\":\"specific repeated subject\"}. " +
    "Candidate: " + JSON.stringify(candidate) + " | Accepted questions: " + JSON.stringify(accepted);
  try {
    const parsed = parseModelJson<{
      ok?: boolean; note?: string; confidence?: string;
      candidate_subtopic?: string | null; candidate_entity?: string | null;
      conflict_index?: number | null; rejection_reason?: string;
    }>(await callAPI(prompt, 350, true, false, VALIDATION_MODEL), "object");
    const conflictIndex = Number.isInteger(parsed.conflict_index) && (parsed.conflict_index as number) >= 1 && (parsed.conflict_index as number) <= currentRound.length
      ? parsed.conflict_index as number
      : null;
    const details: RoundBalanceDetails = {
      candidate_subtopic: parsed.candidate_subtopic || null,
      candidate_entity: parsed.candidate_entity || null,
      conflict_index: conflictIndex,
      rejection_reason: parsed.rejection_reason || parsed.note || "",
    };
    const highConfidenceConflict = parsed.ok === false && parsed.confidence === "high" && conflictIndex !== null;
    return {
      ok: !highConfidenceConflict,
      note: highConfidenceConflict ? (details.rejection_reason || "High-confidence repeated subject") : (parsed.note || "No high-confidence round-balance conflict"),
      details,
    };
  } catch {
    return { ok: true, note: "Round-balance check unavailable - allowed", details: emptyDetails };
  }
}

export async function runCombinedValidation(q: Question, currentRound: Question[], theme: string, recencyNote?: string): Promise<{
  moderation: { ok: boolean; note: string; unavailable?: boolean };
  balance: { ok: boolean; note: string; details: RoundBalanceDetails };
  quality: { ok: boolean; note: string };
}> {
  const optionTexts = [q.option_a, q.option_b, q.option_c, q.option_d, q.option_e, q.option_f];
  const isMedia = q.question_type === "picture" || q.question_type === "audio";
  const candidate = {
    type: q.question_type,
    question: q.question_text || "",
    options: isMedia ? [] : optionTexts.filter(Boolean),
    answer: resolveAnswerText(q) || "",
    player_visible_media: q.question_type === "audio"
      ? "An audio clip is played; no lyric transcript or other content description is supplied."
      : q.question_type === "picture"
        ? "An image is shown; no visual-content description is supplied."
        : "None",
    internal_media_lookup: isMedia ? (q.option_a || "None") : "None",
    theme: (theme || "").trim() || "None",
  };
  const accepted = currentRound.map((existing, index) => ({
    index: index + 1,
    type: existing.question_type,
    question: existing.question_text || "",
    answer: resolveAnswerText(existing) || "",
    internal_media_lookup: ["picture", "audio"].includes(existing.question_type) ? (existing.option_a || "None") : "None",
  }));
  const prompt =
    "Perform three INDEPENDENT checks on one commercial pub-quiz question and return all three verdicts in one tool call. " +
    "MODERATION: Judge only player-visible Question, Options, Answer and explicitly described player-visible media. Internal media lookup is private metadata: use its literal title/artist/subject only to identify and fact-check the answer. Never infer or analyse lyrics, plot, themes, subtext, artist history or character history. Allow mainstream commercial music, films, books and TV unless the actual presented title/content is inappropriate. A neutral factual alcohol reference is allowed; promotion is not. Reject only genuinely explicit sexual material, crude anatomical language, illegal-drug promotion, pork promotion, religious or LGBTQ+ advocacy or sensitive discussion, Iran or Israel political content, hate speech, slurs, harassment, discrimination, graphic violence, or clearly offensive/prohibited presented content. 'Name this song' with lookup 'Mr. Brightside - The Killers' must pass. Also verify the answer is factually correct. " +
    "ROUND BALANCE: Compare only with accepted questions. Reject only with HIGH confidence for the same primary entity, same narrow subtopic, or effectively the same underlying knowledge. Broad-category overlap is allowed; incidental/weak relationships pass; never reject merely for the same country. If themed, the shared theme is intentional, but repeated franchises/entities inside it are not. conflict_index is the 1-based accepted-question index, otherwise null. " +
    "FINAL QUALITY AND FACTUAL ACCURACY: Independently verify that the exact answer is a real, complete, factually correct answer to the exact wording. Pass only if an experienced professional host would willingly use it. Reject invented or truncated names, unnatural/ambiguous/trivial/misleading wording, answers players would not naturally give, answer giveaways, multiple reasonable answers, category/event/gender ambiguity, poor quiz design, or media that does not directly support the question. Example that MUST fail: 'What trophy is awarded to the winner of Wimbledon?' answer 'Venus'—there is no trophy called Venus, and the event is unspecified; the women's trophy is the Venus Rosewater Dish and the men's is the Gentlemen's Singles Trophy. Do not rely on the explanation. " +
    "Return moderation_ok/note, balance_ok/note/confidence, quality_ok/note, candidate_subtopic, candidate_entity, conflict_index and rejection_reason. Uncertainty in balance must pass. " +
    (recencyNote
      ? "This candidate concerns a recent/current event that may post-date your training data, so you may not personally recognise it - that unfamiliarity alone is NOT grounds for a factual-accuracy rejection. A live web search was already run to verify it; treat this as ground truth for the quality/factual check: " + recencyNote + " "
      : "") +
    "Candidate labelled fields: " + JSON.stringify(candidate) + " | Accepted questions: " + JSON.stringify(accepted);
  try {
    const parsed = parseModelJson<{
      moderation_ok?: boolean; moderation_note?: string;
      balance_ok?: boolean; balance_note?: string; balance_confidence?: string;
      quality_ok?: boolean; quality_note?: string;
      candidate_subtopic?: string | null; candidate_entity?: string | null;
      conflict_index?: number | null; rejection_reason?: string;
    }>(await callAPI(prompt, 550, true, false, FACT_CHECK_MODEL, true), "object");
    const conflictIndex = Number.isInteger(parsed.conflict_index) && (parsed.conflict_index as number) >= 1 && (parsed.conflict_index as number) <= currentRound.length
      ? parsed.conflict_index as number
      : null;
    const highConfidenceConflict = parsed.balance_ok === false && parsed.balance_confidence === "high" && conflictIndex !== null;
    const details: RoundBalanceDetails = {
      candidate_subtopic: parsed.candidate_subtopic || null,
      candidate_entity: parsed.candidate_entity || null,
      conflict_index: conflictIndex,
      rejection_reason: parsed.rejection_reason || parsed.balance_note || "",
    };
    return {
      moderation: { ok: parsed.moderation_ok === true, note: parsed.moderation_note || (parsed.moderation_ok ? "OK" : "Moderation rejected") },
      balance: { ok: !highConfidenceConflict, note: highConfidenceConflict ? (details.rejection_reason || "High-confidence repeated subject") : (parsed.balance_note || "No high-confidence round-balance conflict"), details },
      quality: { ok: parsed.quality_ok === true, note: parsed.quality_note || (parsed.quality_ok ? "OK" : "Final quality rejected") },
    };
  } catch {
    const [moderation, balance, quality] = await Promise.all([
      checkQuestion(q, theme, recencyNote),
      checkRoundBalance(q, currentRound, theme),
      finalQualityCheck(q, theme, recencyNote),
    ]);
    return { moderation, balance, quality };
  }
}

export async function isDuplicateInMemory(q: Question, exclusions: ExclusionState, onDegraded?: () => void): Promise<boolean> {
  if (exclusions.usedFingerprints.has(questionFingerprint(q))) return true;
  try {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("check_question_memory", {
      p_text: memoryText(q),
      p_type: q.question_type,
      p_threshold: 0.75,
    });
    if (error) { console.error("Question Memory check unavailable (allowing question):", error.message); onDegraded?.(); return false; }
    return data != null;
  } catch (e) {
    console.error("Question Memory check error (allowing question):", e);
    onDegraded?.();
    return false;
  }
}

export async function validateCandidate(
  q: Question,
  currentRound: Question[],
  stages: ValidationResults,
  theme: string,
  exclusions: ExclusionState,
  onMemoryDegraded?: () => void,
): Promise<{ ok: boolean; category: string; reason: string; stages: ValidationResults }> {
  const duplicateReason = duplicateRejectionReason(q, currentRound, theme, exclusions);
  stages.duplicate = duplicateReason ? { status: "failed", note: duplicateReason } : { status: "passed", note: "No session or round duplicate" };
  if (duplicateReason) return { ok: false, category: "Duplicate", reason: duplicateReason, stages };

  const memoryDuplicate = await isDuplicateInMemory(q, exclusions, onMemoryDegraded);
  stages.memory = memoryDuplicate ? { status: "failed", note: "Matched permanent Question Memory" } : { status: "passed", note: "No permanent-memory match" };
  if (memoryDuplicate) return { ok: false, category: "Permanent memory", reason: stages.memory.note, stages };

  const { moderation, balance, quality } = await runCombinedValidation(q, currentRound, theme, q._recencyNote);
  stages.moderation = { status: moderation.ok ? "passed" : "failed", note: moderation.note };
  stages.balance = { status: balance.ok ? "passed" : "failed", note: balance.note, details: balance.details };
  stages.quality = { status: quality.ok ? "passed" : "failed", note: quality.note };
  if (!moderation.ok) return { ok: false, category: moderation.unavailable ? "Moderation unavailable" : "Moderation", reason: moderation.note, stages };
  if (balance && !balance.ok) return { ok: false, category: "Round balance", reason: balance.note, stages };
  if (!quality.ok) return { ok: false, category: "Final quality", reason: quality.note, stages };
  return { ok: true, category: "Accepted", reason: "Passed every applicable validation stage", stages };
}

// Picture/audio questions share generic templated phrasing regardless of
// subject ("Which country is this flag from?" is identical text for Japan,
// France, Brazil...). The permanent memory table has a unique constraint on
// (question_text, question_type), and check_question_memory matches on text
// alone - so storing the raw templated text meant only the FIRST country/
// animal/etc ever generated under a given template could ever occupy that
// slot. Suffixing the memory text with the answer for these two types gives
// each distinct subject its own slot while leaving what's actually shown to
// players (q.question_text) untouched.
export function memoryText(q: Question): string {
  return ["picture", "audio"].includes(q.question_type) ? `${q.question_text} (${q.correct_answer})` : q.question_text;
}

export async function commitToMemory(q: Question, onDegraded?: () => void) {
  try {
    const supabase = createSupabaseBrowserClient();
    const libRow = {
      question_text: memoryText(q),
      correct_answer: q.correct_answer,
      option_a: ["picture", "audio"].includes(q.question_type) ? null : q.option_a,
      option_b: ["picture", "audio"].includes(q.question_type) ? null : q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      option_e: q.option_e,
      option_f: q.option_f,
      explanation: q.explanation,
      difficulty: q.difficulty,
      question_type: q.question_type,
      media_url: ["picture", "audio"].includes(q.question_type) ? q.option_b : null,
    };
    const { data: libData } = await supabase
      .from("questions")
      .upsert(libRow, { onConflict: "question_text,question_type", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (libData?.id) {
      q.id = libData.id;
    } else {
      const { data: existing } = await supabase
        .from("questions")
        .select("id")
        .ilike("question_text", memoryText(q))
        .eq("question_type", q.question_type)
        .maybeSingle();
      if (existing?.id) q.id = existing.id;
    }
  } catch (libErr) {
    console.error("Failed to save question to permanent memory:", libErr);
    onDegraded?.();
  }
}
