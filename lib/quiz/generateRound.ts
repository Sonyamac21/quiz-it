// lib/quiz/generateRound.ts
//
// Shared, parameterized version of the question-generation pipeline that lives
// in app/host/questions/page.tsx. This file is a DELIBERATE, near-verbatim copy
// of that page's validators/prompts (moderation, theme-relevance, round-balance,
// permanent Question Memory, final quality, and the generate() retry loop) - not
// a reimplementation - so the bulk/parallel generator gets IDENTICAL quality and
// duplicate-safety behaviour to the existing single-round generator.
//
// The one real difference: the original page keeps all "session state" (used
// questions, used answers, rejected blacklist) in React refs shared across the
// whole page. That's fine for one round at a time, but unsafe for several rounds
// generating concurrently - two parallel calls would stomp on the same refs and
// corrupt each other's exclusion lists. Here that state is an explicit
// `ExclusionState` object passed in and returned, so each round generating in
// parallel gets (and mutates) its own bundle. Callers that want cross-round
// duplicate protection within one "Generate All" batch should pass the SAME
// bundle into each call sequentially seeded, or merge bundles between waves -
// see generateAllRounds() in this file for the batch orchestrator.
//
// This module does NOT touch app/host/questions/page.tsx - the existing
// single-round generator is untouched and keeps working exactly as it does now.

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PURSUIT_TOTAL_QUESTIONS } from "@/lib/quiz/pursuit";
import { persistPixabayImage } from "@/lib/quiz/persistPixabayImage";

// ── Types (copied from app/host/questions/page.tsx) ────────────────────────

export type Question = {
  id?: number;
  _uid?: string;
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

type ValidationStatus = "passed" | "failed" | "not_run" | "not_applicable";
type ValidationStage = "moderation" | "theme" | "duplicate" | "balance" | "memory" | "quality" | "media";
type RoundBalanceDetails = {
  candidate_subtopic: string | null;
  candidate_entity: string | null;
  conflict_index: number | null;
  rejection_reason: string;
};
type ValidationResult = { status: ValidationStatus; note: string; details?: RoundBalanceDetails };
type ValidationResults = Record<ValidationStage, ValidationResult>;
export type GenerationReportEntry = {
  id: string;
  outcome: "accepted" | "rejected";
  questionText: string;
  questionType: string;
  category: string;
  reason: string;
  stages: ValidationResults;
};
type CandidateReport = Omit<GenerationReportEntry, "id" | "outcome" | "category" | "reason">;
type GenerationContext = { error: string; report: CandidateReport };

// ── Constants (copied verbatim) ─────────────────────────────────────────────

const TOPICS = ["music","movies","TV shows","sport","football","food and drink","celebrities","geography","famous landmarks","logos and brands","travel","social media and internet","simple history","famous people","animals","classic cartoons","video games","awards and records","fashion and style","comedy and humour","reality TV","theatre and musicals","UK culture","US culture","international culture","childhood and nostalgia","royals and politics","crime and mystery","cars and transport","nature and wildlife","recent entertainment news (last 1-3 years, no politics)","celebrity and pop culture moments (last 1-3 years, no politics)"];
const MUSIC_TOPICS = ["80s pop","90s pop","2000s pop","2010s and 2020s pop","classic rock","indie and alternative rock","hip hop and rap","R&B and soul","dance and EDM","disco and funk","UK number one hits","US number one hits","movie theme songs","musical theatre songs","Christmas songs","one-hit wonders","boy bands and girl groups","singer-songwriters","classic 60s and 70s hits","karaoke classics"];
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
const PICTURE_TOPICS = ["famous landmarks","world flags","animals and wildlife","iconic buildings","national dishes and cuisine","famous bridges","sports stadiums","big cats and safari animals","dog and cat breeds","famous mountains and natural wonders","tropical destinations","classic desserts and sweets","famous rivers and waterfalls","farm animals","street food dishes"];
const VARIETY_ANGLES = [
  "from the 1960s or 1970s", "from the 1980s", "from the 1990s", "from the 2000s", "from the 2010s or later",
  "that's a deeper cut, not the most obvious example", "with a British/UK angle", "with a US angle",
  "that's slightly more obscure but still well-known", "involving a lesser-discussed fact about the topic",
  "from a different decade than you'd first think of", "that most people would NOT guess first",
];

// Shared AI concurrency queue. A module-level singleton, same as the page's -
// every round generating in parallel shares this one queue/limit so the total
// number of simultaneous Anthropic calls across ALL rounds never exceeds the
// same cap the single-round generator already respects.
// Was 3 - raised now that most calls per candidate (moderation/theme/
// quality/balance) run on Haiku instead of Sonnet: those are faster and far
// cheaper per call, so more of them can genuinely run at once without
// pushing total token throughput anywhere near Anthropic's rate limits. If
// this ever starts producing 429 rate-limit errors in the generation
// status text, drop it back down.
const MAX_AI_CONCURRENCY = 5;
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

function parseModelJson<T>(text: string, container: "object" | "array"): T {
  const trimmed = text.trim();
  const start = container === "array" ? trimmed.indexOf("[") : trimmed.indexOf("{");
  const end = container === "array" ? trimmed.lastIndexOf("]") : trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON " + container + " found in response");
  return JSON.parse(trimmed.slice(start, end + 1)) as T;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeQuestionText(s: string): string {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function questionFingerprint(q: Question): string {
  const opts = [q.option_a, q.option_b, q.option_c, q.option_d, q.option_e, q.option_f]
    .map(o => (o || "").toLowerCase().trim())
    .join("|");
  return normalizeQuestionText(q.question_text) + "::" + (q.correct_answer || "").toLowerCase().trim() + "::" + opts;
}

let uidCounter = 0;
function genUid(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  uidCounter += 1;
  return "q_" + Date.now().toString(36) + "_" + uidCounter;
}

function emptyValidationResults(hasTheme: boolean, isMedia: boolean): ValidationResults {
  return {
    moderation: { status: "not_run", note: "" },
    theme: { status: hasTheme ? "not_run" : "not_applicable", note: "" },
    duplicate: { status: "not_run", note: "" },
    balance: { status: hasTheme ? "not_applicable" : "not_run", note: "" },
    memory: { status: "not_run", note: "" },
    quality: { status: "not_run", note: "" },
    media: { status: isMedia ? "not_run" : "not_applicable", note: "" },
  };
}

function createGenerationContext(type: string, hasTheme: boolean): GenerationContext {
  return {
    error: "",
    report: { questionText: "", questionType: type, stages: emptyValidationResults(hasTheme, type === "picture" || type === "audio") },
  };
}

function stageLabel(stage: ValidationStage): string {
  const labels: Record<ValidationStage, string> = {
    moderation: "Moderation", theme: "Theme relevance", duplicate: "Duplicate",
    balance: "Round balance", memory: "Permanent memory", quality: "Final quality", media: "Media lookup",
  };
  return labels[stage];
}

// ── Exclusion state (the parallel-safe replacement for the page's refs) ────

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

function blacklistRejected(state: ExclusionState, q: Question) {
  const fingerprint = questionFingerprint(q);
  if (fingerprint) state.rejectedFingerprints.add(fingerprint);
  const text = normalizeQuestionText(q.question_text);
  if (text) state.rejectedTexts.add(text);
}

function registerAccepted(state: ExclusionState, q: Question) {
  state.used = [...state.used, q.question_text];
  state.usedFingerprints.add(questionFingerprint(q));
  const normAnswer = (q.correct_answer || "").toLowerCase().trim();
  if (normAnswer) state.usedAnswers = [...state.usedAnswers, normAnswer];
}

// ── AI calls (copied verbatim, same /api/generate-questions server route) ──

// Sonnet is only actually needed for the creative writing call (the question
// itself) - moderation/quality/balance are simple pass/fail judgment calls on
// content that already exists, which Haiku handles just as reliably for a
// fraction of the per-token cost. Since every candidate triggers 3-4 of
// these calls (1 generation + up to 3 validation checks, each retried on
// failed attempts), and validation was silently the majority of spend, this
// is the single biggest lever on the Anthropic bill without touching output
// quality - the part that actually needs the stronger model is untouched.
const VALIDATION_MODEL = "claude-haiku-4-5-20251001";

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
const CLIENT_REQUEST_TIMEOUT_MS = 35_000;

async function callAPI(prompt: string, maxTokens: number = 8000, structuredOutput: boolean = false, webSearch: boolean = false, model?: string) {
  const res = await withAiRequestSlot(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);
    return fetch("/api/generate-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, maxTokens, structuredOutput, webSearch, model }),
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

async function checkQuestion(q: Question, theme: string): Promise<{ ok: boolean; note: string; unavailable?: boolean }> {
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
    "Also verify that the Answer is factually correct for the Question, using the literal reference metadata when needed. " +
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

async function checkThemeRelevance(q: Question, activeTheme: string): Promise<{ ok: boolean; note: string }> {
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

function resolveAnswerText(q: Question): string {
  const map: Record<string, string | null> = { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d, e: q.option_e, f: q.option_f };
  const key = (q.correct_answer || "").trim().toLowerCase();
  if (q.question_type === "multiple_choice") return map[key] || q.correct_answer;
  if (q.question_type === "multi_tap" || q.question_type === "sequence") {
    const parts = key.split(",").map(s => s.trim()).map(l => map[l]).filter(Boolean) as string[];
    return parts.length ? parts.join(", ") : q.correct_answer;
  }
  return q.correct_answer;
}

async function finalQualityCheck(q: Question, theme: string): Promise<{ ok: boolean; note: string }> {
  const resolvedAnswer = resolveAnswerText(q);
  const options = [q.option_a, q.option_b, q.option_c, q.option_d, q.option_e, q.option_f].filter(Boolean).join(" | ");
  const isMedia = q.question_type === "picture" || q.question_type === "audio";
  const subject = isMedia ? (q.option_a || "") : "";
  const activeTheme = (theme || "").trim();
  const prompt =
    "You are an experienced professional pub quiz host performing FINAL quality control on ONE question before it goes live. " +
    "Ask yourself: \"Would an experienced professional quiz host WILLINGLY use this EXACT question in a live pub quiz?\" Pass ONLY if the answer is an unequivocal YES. " +
    "Reject (ok:false) if it suffers from ANY of: (1) unnatural wording; (2) awkward grammar; (3) artificially restricted answers; (4) an answer that is technically correct but not what a player would naturally type; (5) it depends on the explanation to make sense; (6) trivial or pointless; (7) poor quiz design; (8) misleading; (9) a generic question disguised as themed; (10) an image that does not directly represent the answer; (11) it gives the answer away; (12) it could reasonably have multiple correct answers; (13) it requires excessive interpretation; (14) it doesn't feel enjoyable to play; (15) anything a competent quiz writer would immediately rewrite. " +
    "Examples that MUST fail: Text Answer 'In which movie does a boy say \"I see dead people\"?' answer 'Sixth' (nobody naturally types 'Sixth'). Number 'How many teams are in the Premier League? To the nearest 5' (the 'nearest 5' is pointless). A picture of a real bear asking 'What animal is Yogi Bear?' (the image gives away 'bear'). Disney-themed 'What animal is this?' over a real chameleon (not actually a Disney question). " +
    "Judge the question exactly as a player would experience it. DO NOT rely on the explanation to make it make sense. " +
    "Reply ONLY with JSON {\"ok\":true,\"note\":\"OK\"} or {\"ok\":false,\"note\":\"short reason\"}. " +
    "Type: " + q.question_type + " | Theme: " + (activeTheme || "none") +
    " | Question: " + (q.question_text || "") +
    " | Answer a player would type: " + (resolvedAnswer || "") +
    (options ? " | Options: " + options : "") +
    (subject ? " | Image/Audio subject (internal search query, not shown to players): " + subject : "");
  try {
    const text = await callAPI(prompt, 300, true, false, VALIDATION_MODEL);
    return parseModelJson<{ ok: boolean; note: string }>(text, "object");
  } catch {
    return { ok: true, note: "quality-check-unavailable" };
  }
}

async function generateOne(
  type: string,
  topic: string,
  context: GenerationContext,
  opts: { theme: string; difficulty: string; roundType: string; exclusions: ExclusionState; forceObscure?: boolean },
): Promise<Question | null> {
  const { theme, difficulty, roundType, exclusions, forceObscure } = opts;
  context.error = "";
  context.report = { questionText: "", questionType: type, stages: emptyValidationResults(Boolean(theme.trim()), type === "picture" || type === "audio") };
  const typeInstructions: Record<string, string> = {
    multi_tap: "multi_tap: exactly 6 options in option_a through option_f. Some are correct answers, some are decoys (wrong). Mix the count - between 2 and 4 of the 6 should be correct. correct_answer must be a comma-separated list of the correct option letters in order, e.g. \"b,d,f\" or \"a,c\". Make decoys plausible, not obviously wrong.",
    multiple_choice: "multiple_choice: 4 options A/B/C/D, correct_answer is a, b, c, or d",
    text_answer: "text_answer: the correct_answer MUST be a SINGLE word - no spaces, no commas, no \"and\", no \"&\", no \"/\", no multiple names, no multiple items, no hyphen-joined names. If the natural answer would be more than one word, choose a different question whose answer is a single word. All options must be null.",
    number: "number: numeric answer, options null except option_a which has a helpful hint e.g. \"To the nearest 10\"",
    sequence: "sequence: 4 items that have a definite correct chronological/logical order, written into option_a/b/c/d in that correct order. correct_answer must be exactly \"a,b,c,d\" (the order will be randomized programmatically afterward, so always write them in true correct order here).",
    picture: "picture: this generates a PICTURE ROUND question. There are two SEPARATE pieces of information you must produce - do not mix them: (1) option_a is an internal media search query, NEVER shown to players, used only to fetch a stock photo - a short, generic Google Images search query (3-5 words), e.g. \"Eiffel Tower Paris\" or \"red panda animal\" or \"Italian flag\". The subject MUST be one of: a famous landmark or building, an animal or species, a national flag, a well-known food or dish, or a sports venue/stadium. Do NOT use company/brand logos, famous people, movie stills, album covers, TV characters, or any copyrighted artwork or photography - these will not be found on stock photo sites (Pixabay specifically does not carry trademarked logos, so brand questions always return an unrelated photo). (2) question_text is the actual question shown to players underneath the image - it must be a short, generic question ABOUT the image itself, e.g. \"Name this landmark\", \"Which country is this flag from?\", \"What animal is this?\", \"Which city is this stadium in?\". question_text must NEVER contain the words \"Show teams this image\", must NEVER name or describe the actual subject (that would give away the answer), and must NEVER be an unrelated trivia question - it must always be directly answerable by looking at the image. option_b/c/d must be null. correct_answer is the specific answer to question_text (the landmark name, the country, the animal, etc).",
    audio: "audio: this generates a MUSIC ROUND question. There are two SEPARATE pieces of information you must produce - do not mix them: (1) option_a is an internal media search query, NEVER shown to players, used only to help find/reference the source track - a YouTube search query, e.g. \"Bohemian Rhapsody Queen official\". (2) question_text is the actual question shown to players after the clip plays - it must be a short, generic question ABOUT the song, e.g. \"Name this song\", \"Which artist performs this song?\", \"What year was this song released?\", \"Finish the lyric: ...\". question_text must NEVER state the song title or artist directly (that would give away the answer) and must NEVER be unrelated trivia - it must always be something a listener could only answer by having heard the clip. option_b/c/d must be null. correct_answer is the specific answer to question_text (the song title, the artist name, the year, etc - matching whatever question_text actually asks).",
  };
  const rejectedList = Array.from(exclusions.rejectedTexts);
  let exclusionsText = [...rejectedList, ...exclusions.used.slice(-25)].map((q, i) => (i + 1) + ". " + q).join("; ");
  if (exclusionsText.length > 1800) exclusionsText = exclusionsText.slice(0, 1800);
  const usedAnswersList = exclusions.usedAnswers.slice(-20).filter(Boolean).join(", ");
  let exclusionNote = (exclusionsText || usedAnswersList)
    ? " Do NOT generate any of these already-used questions: " + exclusionsText + "."
      + (usedAnswersList ? " Also do NOT use any of these already-used answers (even with different question wording): " + usedAnswersList + "." : "")
    : "";
  if (exclusionNote.length > 1200) exclusionNote = exclusionNote.slice(0, 1200);
  // These two topics are the only ones allowed to touch anything from the
  // last few years - everything else in TOPICS is evergreen trivia that the
  // model already knows solidly. For these two specifically, ungrounded
  // generation was producing stale or occasionally wrong "recent" facts,
  // since the model only knows whatever was true as of its training cutoff,
  // not what's actually current. Routing just these through Claude's live
  // web search tool (wired in app/api/generate-questions/route.ts) fixes
  // that at the source instead of relying on the model to "remember"
  // correctly.
  const isRecencyTopic = topic === "recent entertainment news (last 1-3 years, no politics)"
    || topic === "celebrity and pop culture moments (last 1-3 years, no politics)";
  // A long-running account's permanent Question Memory eventually holds
  // most of the OBVIOUS mainstream facts for a common topic (the ones a
  // random angle pick keeps re-discovering) - so a run of consecutive
  // Permanent-memory-match rejections stops picking a random angle and
  // deliberately forces "deeper cut" instead, to push the model off the
  // same well-trodden obvious answers it keeps proposing.
  const angle = forceObscure ? "a deeper cut, not the most obvious example - genuinely less commonly asked, while still fair and answerable by a general pub-quiz crowd" : VARIETY_ANGLES[Math.floor(Math.random() * VARIETY_ANGLES.length)];
  const varietyNote = type === "audio"
    ? " IMPORTANT - pick a well-known song: either a genuinely famous track a pub crowd would clap along to, OR any other song (even a deeper cut, B-side, or later single) by a genuinely famous, widely recognised artist/band - the artist being well-known is enough on its own, the specific song does not also have to be their single most famous hit. Not obscure/unknown artists either way. Vary the decade/genre/artist from recent picks."
    : " IMPORTANT - avoid defaulting to the single most famous, first-thought-of example for this topic (e.g. for 'Disney songs' don't always pick Let It Go or Circle of Life). Where possible, lean toward something " + angle + ". Vary your answer choices across different eras, genres, and sub-topics rather than the most obvious pick.";
  const prompt = `You are writing questions for a LIVE PUB QUIZ at a bar or restaurant. Your audience is adults aged 25-55 having a social night out. This is entertainment, not education.
BEFORE writing any question, ask yourself: "Would 8 friends sitting in a pub enjoy answering this?" If no, do not write it.
FIRST-PASS CHECK (do silently): consider several different facts and entities; reject any that paraphrase an excluded question or reuse its entity, answer or knowledge test; then choose the strongest stable fact with one clear natural answer. Check only player-visible content for venue suitability—unseen plots, lyrics and themes do not make a mainstream work unsuitable.
TOPIC: ${topic}
TYPE: ${typeInstructions[type]}
DIFFICULTY: ${difficulty === "easy" ? "EASY - almost everyone in the room should get this right" : difficulty === "hard" ? "HARD - a well-informed pub team might know this, but it is still based on widely-known popular culture or history, never specialist academic knowledge" : "MEDIUM - a mixed group of adults has a fair chance, about half the room gets it right"}
TONE AND STYLE:
- Fun, social, conversational
- Think Kahoot or bar trivia night, not University Challenge
- Questions should feel satisfying and recognisable when answered
- Short question text - a host reads this aloud, keep it under 20 words where possible
- Use plain everyday English, no jargon
WHAT TO WRITE ABOUT (high priority):
Music, movies, TV shows, celebrities, football, world geography, famous brands, logos, food and drink, famous landmarks, travel destinations, pop culture, social media, simple history, famous people, famous companies, sport, everyday life
WHAT TO NEVER WRITE ABOUT:
Mathematics, advanced science, chemistry, physics, medicine, rare diseases, engineering, obscure geography, scientific terminology, specialist vocabulary, academic concepts, anything requiring university-level knowledge
STRICT QUALITY RULES (every question must pass all of these):
1. The answer must NOT appear anywhere inside the question text. Never give away or hint at the answer in the question itself.
2. No words that are difficult to pronounce aloud at speed. A host reads this live to a noisy room.
3. No specialist terminology. If an average person would not know the word, do not use it.
4. Wrong answer options must be plausible. Use well-known alternatives someone might genuinely confuse, not obviously wrong fillers.
5. Every question must be answerable by a reasonably well-informed adult with no specialist training.
6. UAE venue safe: no alcohol references, no pork, no sexual content, no religion, no LGBTQ+ content, no Iran or Israel political references.
7. Use one stable, verifiable fact: nothing disputed, subjective, or invented.${isRecencyTopic
    ? " This question is for the \"" + topic + "\" topic - you have a web_search tool available and MUST use it before writing the question. Search for a genuinely well-known, headline-level entertainment/celebrity/pop-culture/sport event from roughly the last 1-3 years (award win, major release, record, retirement, high-profile moment). Base the question and correct_answer strictly on what your search results actually confirm - do not fall back on memory alone or guess at a date, result or detail your search didn't verify. If search results are unclear or conflicting on a fact, pick a different, more clearly-confirmed event instead of guessing. Never write about politics, elections, war, or anything from the last few weeks (too recent to be common knowledge to a pub crowd yet)."
    : " For the \"recent entertainment news\" and \"celebrity and pop culture moments\" topics only, you may use well-known entertainment, film/TV, music, sport or celebrity events from roughly the last 1-3 years (award wins, releases, retirements, records, headline pop-culture moments) - never politics, never anything from the last few months, and never anything you are not confident is still accurate."}
8. Wording must allow exactly one defensible, natural answer-not an abbreviation, fragment, trick or technicality.
9. If the correct_answer is a person's name and only part of the full name (surname only, or first name only) will be stored as the answer, the question_text itself must explicitly state which part is required (e.g. "What is the SURNAME of the actress who played Katniss Everdeen?" with correct_answer "Lawrence", or "What is the FIRST NAME of the actor who played Iron Man?" with correct_answer "Robert"). Never ask an ambiguous full-name question and store only a partial name as the answer.
10. The question must stand alone without its explanation and test one satisfying piece of knowledge.
11. Stay on TOPIC but use a genuinely different entity and narrow subtopic from the exclusions.
${varietyNote}${exclusionNote}
Include a 1-2 sentence explanation of the answer in the explanation field.
Verify strict JSON before responding: one array item, every schema key present, unused options null, exact requested type and answer format, with no markdown or extra text.
Return ONLY a valid JSON array with 1 item, no markdown:
[{"question_text":"...","question_type":"${type}","option_a":"...","option_b":"...","option_c":"...","option_d":"...","option_e":"...","option_f":"...","correct_answer":"...","explanation":"...","difficulty":"${difficulty}","round_type":"${roundType}"}]`;
  const safePrompt = prompt.length > 7500 ? prompt.slice(0, 7500) : prompt;
  try {
    // Web-search-grounded calls need more token headroom than a plain
    // generation call - the search results themselves, plus the model's
    // tool-use turn, both count against the same max_tokens ceiling before
    // it even gets to writing the final question JSON.
    const text = await callAPI(safePrompt, 8000, false, isRecencyTopic);
    let q;
    try {
      q = parseModelJson<Array<Question & Record<string, unknown>>>(text, "array")[0];
    } catch {
      throw new Error("JSON parse failed. Raw text (first 500 chars): " + text.slice(0, 500));
    }
    if (q) { q.question_type = type; }
    if (q) { context.report.questionText = q.question_text || "Untitled candidate"; }
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
        const pixRes = await fetch(
          "https://pixabay.com/api/?key=" + pixabayKey +
          "&q=" + encodeURIComponent(q.option_a) +
          "&image_type=photo&per_page=5&safesearch=true"
        );
        const pixData = await pixRes.json();
        const hit = pixData?.hits?.[0];
        if (hit) {
          const pixabayUrl = hit.webformatURL || hit.largeImageURL;
          // Re-host in our own storage - Pixabay's hotlink URLs are not
          // guaranteed permanent and have been observed going dead over time.
          q.option_b = await persistPixabayImage(pixabayUrl);
          context.report.stages.media = { status: "passed", note: "Pixabay image found" };
        } else {
          context.report.stages.media = { status: "failed", note: "No Pixabay image found" };
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
    if (q && q.question_type === "sequence") {
      const letters = ["a", "b", "c", "d"];
      const items = letters.map(l => q["option_" + l]);
      const shuffledLetters = shuffle(letters);
      const newOptions: Record<string, unknown> = {};
      shuffledLetters.forEach((slot, i) => { newOptions[slot] = items[i]; });
      letters.forEach(l => { q["option_" + l] = newOptions[l]; });
      q.correct_answer = shuffledLetters.join(",");
    }
    if (q && q.question_type === "multi_tap") {
      const letters = ["a", "b", "c", "d", "e", "f"];
      const items = letters.map(l => q["option_" + l]).filter((t: unknown) => t !== null && t !== undefined && t !== "");
      const correctLetters = (q.correct_answer || "").split(",").map((s: string) => s.trim().toLowerCase());
      const usedLetters = letters.slice(0, items.length);
      const wasCorrect = usedLetters.map(l => correctLetters.includes(l));
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

function duplicateRejectionReason(q: Question, currentRound: Question[], theme: string, exclusions: ExclusionState): string | null {
  const COMMON = new Set([
    "what","which","where","when","who","that","this","with","from","have","been","were","they","their","about","only","does","into","than","other","more","over","some","also","after","before","known","the","and","for","are","but","not","you","all","can","had","her","him","his","how","man","new","now","old","see","two","way","boy","did","its","let","put","say","she","too","use","was","your","them","then","here","there","was","are",
    "film","films","movie","movies","song","songs","music","character","characters","name","named","names","actor","actress","actors","voice","voiced","played","plays","play","called","feature","features","featured","animated","animation","show","shows","series","episode","famous","first","last","title","titled","released","release","year","years","won","wins","winner","story","stories","franchise","sequel","original","company","brand","team","player","country","city","capital","word","words","number",
  ]);
  const themeTokens = (theme || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const ignore = new Set<string>([...COMMON, ...themeTokens]);
  const sigWords = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 3 && !ignore.has(w));
  const normAnswer = (q.correct_answer || "").toLowerCase().trim();
  const fingerprint = questionFingerprint(q);
  if (exclusions.rejectedFingerprints.has(fingerprint)) return "blacklist";
  if (exclusions.usedFingerprints.has(fingerprint)) return "exact-question:used-or-history";
  if (currentRound.some(g => questionFingerprint(g) === fingerprint)) return "exact-question:current-round";
  if (normAnswer && currentRound.some(g =>
    g.question_type === q.question_type &&
    (g.correct_answer || "").toLowerCase().trim() === normAnswer
  )) return "same-answer:current-round";
  const newWords = sigWords(q.question_text);
  if (newWords.length >= 2) {
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

async function checkRoundBalance(q: Question, currentRound: Question[], theme: string): Promise<{
  ok: boolean;
  note: string;
  details: RoundBalanceDetails;
}> {
  const emptyDetails: RoundBalanceDetails = { candidate_subtopic: null, candidate_entity: null, conflict_index: null, rejection_reason: "" };
  if ((theme || "").trim()) return { ok: true, note: "Themed rounds allow repeated subject matter", details: emptyDetails };
  if (currentRound.length === 0) return { ok: true, note: "First accepted question in round", details: emptyDetails };
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
    "You are an experienced professional pub-quiz host checking the balance of an UNTHEMED general-knowledge round. " +
    "Compare ONE candidate only with the already accepted questions supplied below. Reject only with HIGH confidence when an experienced host would consider the round noticeably repetitive because: (1) the same primary entity appears twice; (2) the same narrow subtopic appears twice; or (3) both questions effectively test the same underlying knowledge. " +
    "Examples that should be rejected: two tennis questions, two Beatles questions, or two volcano questions. " +
    "Allow broad-category overlap such as two different sports or two different music subjects. Allow incidental or weak relationships. Do NOT reject merely because two questions mention or concern the same country; reject only if they also share a genuinely narrow subtopic, primary entity, or underlying knowledge test. " +
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

async function isDuplicateInMemory(q: Question, exclusions: ExclusionState): Promise<boolean> {
  // The fingerprint check is exact-match only (normalized text + answer +
  // options) - it catches a question regenerated verbatim, but NOT a
  // paraphrase of one already used ("Which fashion house has two
  // interlocking Gs?" vs "Which fashion house's logo is two interlocking
  // Gs?" - same fact, same answer, different wording). That's a real gap:
  // this used to be the ONLY check run for multiple_choice/multi_tap/
  // sequence/picture/audio types, skipping the semantic similarity check
  // entirely for most of what actually gets generated. Now every type gets
  // both: the cheap exact check first, then the semantic one underneath.
  if (exclusions.usedFingerprints.has(questionFingerprint(q))) return true;
  try {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("check_question_memory", {
      p_text: memoryText(q),
      p_type: q.question_type,
      // 0.82 required near-total word-for-word similarity to trigger, which
      // let most paraphrased repeats straight through. 0.6 was tried next to
      // fix that, but trigram similarity on SHORT strings (a lot of pub-quiz
      // questions - "How many...", "In which year...", "Who was the
      // first...") is noisy: short text has few total trigrams, so two
      // genuinely different questions that just share a common opening
      // phrase can already clear 0.6 similarity purely from that overlap. On
      // an account with months of saved generation history, that meant
      // EVERY candidate for a common phrasing pattern could get flagged as a
      // "duplicate" of something else that merely started the same way -
      // observed directly as a Pursuit round generating 0 of 25 attempts, all
      // rejected as permanent-memory matches. 0.75 still requires genuinely
      // close rewording (nowhere near "shares an opening phrase"), while no
      // longer treating routine templated phrasing as proof of duplication.
      p_threshold: 0.75,
    });
    if (error) { console.error("Question Memory check unavailable (allowing question):", error.message); return false; }
    return data != null;
  } catch (e) {
    console.error("Question Memory check error (allowing question):", e);
    return false;
  }
}

async function validateCandidate(
  q: Question,
  currentRound: Question[],
  stages: ValidationResults,
  theme: string,
  exclusions: ExclusionState,
): Promise<{ ok: boolean; category: string; reason: string; stages: ValidationResults }> {
  const activeTheme = (theme || "").trim();
  const moderationPromise = checkQuestion(q, theme);
  const balancePromise = activeTheme
    ? Promise.resolve<Awaited<ReturnType<typeof checkRoundBalance>> | null>(null)
    : checkRoundBalance(q, currentRound, theme);
  const memoryPromise = isDuplicateInMemory(q, exclusions);
  const qualityPromise = finalQualityCheck(q, theme);
  const [moderation, balance, memoryDuplicate, quality] = await Promise.all([moderationPromise, balancePromise, memoryPromise, qualityPromise]);
  stages.moderation = { status: moderation.ok ? "passed" : "failed", note: moderation.note };
  const duplicateReason = duplicateRejectionReason(q, currentRound, theme, exclusions);
  stages.duplicate = duplicateReason ? { status: "failed", note: duplicateReason } : { status: "passed", note: "No session or round duplicate" };
  if (!activeTheme) {
    if (!balance) throw new Error("Round Balance result was unavailable");
    stages.balance = { status: balance.ok ? "passed" : "failed", note: balance.note, details: balance.details };
  }
  stages.memory = memoryDuplicate ? { status: "failed", note: "Matched permanent Question Memory" } : { status: "passed", note: "No permanent-memory match" };
  stages.quality = { status: quality.ok ? "passed" : "failed", note: quality.note };
  if (!moderation.ok) return { ok: false, category: moderation.unavailable ? "Moderation unavailable" : "Moderation", reason: moderation.note, stages };
  if (duplicateReason) return { ok: false, category: "Duplicate", reason: duplicateReason, stages };
  if (balance && !balance.ok) return { ok: false, category: "Round balance", reason: balance.note, stages };
  if (memoryDuplicate) return { ok: false, category: "Permanent memory", reason: stages.memory.note, stages };
  if (!quality.ok) return { ok: false, category: "Final quality", reason: quality.note, stages };
  return { ok: true, category: "Accepted", reason: "Passed every applicable validation stage", stages };
}

// Picture/audio questions share generic templated phrasing regardless of
// subject ("Which country is this flag from?" is identical text for Japan,
// France, Brazil...). The permanent memory table has a unique constraint on
// (question_text, question_type), and check_question_memory matches on text
// alone - so storing the raw templated text meant only the FIRST country/
// animal/etc ever generated under a given template could ever occupy that
// slot. Every other distinct subject silently failed to upsert (ignored as
// a "duplicate" of a completely different answer) and got wrongly rejected
// as a permanent-memory match on every later attempt, which is why the same
// single answer (e.g. Japan) kept winning out and recurring across quiz
// plans - it was the only flag question the system could ever successfully
// remember. Suffixing the memory text with the answer for these two types
// gives each distinct subject its own slot while leaving what's actually
// shown to players (q.question_text) untouched.
function memoryText(q: Question): string {
  return ["picture", "audio"].includes(q.question_type) ? `${q.question_text} (${q.correct_answer})` : q.question_text;
}

async function commitToMemory(q: Question) {
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
  }
}

// ── Public API ───────────────────────────────────────────────────────────

export type RoundGenerationSpec = {
  roundType: string;
  difficulty: string;
  theme: string;
  count: number;
};

export type RoundGenerationResult = {
  spec: RoundGenerationSpec;
  questions: Question[];
  report: GenerationReportEntry[];
  finalStatus: string;
  stoppedEarly: boolean;
};

// Generates and validates a single round's worth of questions. Mirrors
// generate() from app/host/questions/page.tsx exactly (same type-mix rules,
// same pipelined-candidate retry loop, same bail-out thresholds), but takes
// its exclusion state as a parameter/return value instead of component refs,
// and reports progress via a callback instead of setState - which is what
// makes it safe to call several times concurrently via Promise.all.
export async function generateValidatedRound(
  spec: RoundGenerationSpec,
  exclusions: ExclusionState,
  onProgress?: (status: string) => void,
  onAccept?: (q: Question) => void,
): Promise<RoundGenerationResult> {
  const { roundType, difficulty, theme } = spec;
  // The Pursuit is always exactly 7 gates total, never host-configurable -
  // but this used to force count to the FULL 7 regardless of what was asked
  // for, on every call. That was fine back when spec.count always meant "the
  // round's total target", but callers (runBulkGenerate's shortfall math,
  // and the per-round "+ GENERATE WITH AI" button) now correctly pass "how
  // many NEW questions to generate" - e.g. a Pursuit round already sitting
  // at 4/7 asking for 3 more. Forcing that back up to 7 generated 7 BRAND
  // NEW ones to append on top of the 4 already there, blowing straight past
  // the fixed 7-gate total. Clamping to at most 7 (rather than replacing
  // outright) still guarantees a single call can never be asked to generate
  // more than a full Pursuit round's worth, without discarding a
  // legitimately smaller top-up request.
  const count = roundType === "pursuit" ? Math.min(spec.count, PURSUIT_TOTAL_QUESTIONS) : spec.count;
  const report: GenerationReportEntry[] = [];
  const addReportEntry = (entry: Omit<GenerationReportEntry, "id">) => { report.push({ ...entry, id: genUid() }); };
  const reportGeneratedFailure = (context: GenerationContext, fallbackType: string) => {
    const candidate = context.report;
    const failedStage = (Object.entries(candidate.stages) as [ValidationStage, ValidationResult][]).find(([, result]) => result.status === "failed");
    const category = failedStage ? stageLabel(failedStage[0]) : "Generation format";
    const reason = failedStage?.[1].note || context.error || "The generator did not return a usable candidate";
    addReportEntry({ outcome: "rejected", questionText: candidate.questionText || "Candidate unavailable", questionType: candidate.questionType || fallbackType, category, reason, stages: candidate.stages });
  };

  let types: string[];
  if (roundType === "music") {
    types = Array(count).fill("audio");
  } else if (roundType === "multi_tap") {
    types = Array(count).fill("multi_tap");
  } else if (roundType === "pursuit") {
    types = shuffle(Array.from({ length: count }, (_, i) => ["multiple_choice", "text_answer", "number", "sequence"][i % 4]));
  } else if (roundType === "hot_seat") {
    types = shuffle(Array.from({ length: count }, (_, i) => ["multiple_choice", "text_answer", "number", "sequence"][i % 4]));
  } else {
    // Largest-remainder allocation instead of independently Math.round()-ing
    // each category then giving audio whatever's left over. Rounding every
    // OTHER category up first could already overshoot the full count (e.g.
    // count=10: mc round(2.5)=3, ta round(2)=2, num round(1.5)=2, seq
    // round(1)=1, pic round(2)=2 - that's 10 already), leaving audio's
    // subtraction at exactly 0 - which is exactly why "Name That Tune"
    // questions were silently missing from a first-pass 10-question Regular
    // round despite having a nonzero intended share. This guarantees the
    // allocations sum to `count` exactly while keeping every category's true
    // proportional share (including audio's).
    const weights: [string, number][] = [
      ["multiple_choice", 0.25], ["text_answer", 0.20], ["number", 0.15],
      ["sequence", 0.10], ["picture", 0.20], ["audio", 0.10],
    ];
    const raw = weights.map(([, w]) => w * count);
    const base = raw.map(Math.floor);
    let remainder = count - base.reduce((a, b) => a + b, 0);
    const order = raw.map((r, i) => ({ i, frac: r - base[i] })).sort((a, b) => b.frac - a.frac);
    for (const { i } of order) { if (remainder <= 0) break; base[i]++; remainder--; }
    types = shuffle(weights.flatMap(([type], i) => Array(base[i]).fill(type)));
  }

  const shuffledTopics = shuffle(TOPICS);
  const shuffledMusicTopics = shuffle(MUSIC_TOPICS);
  const shuffledPictureTopics = shuffle(PICTURE_TOPICS);
  const good: Question[] = [];
  let attempts = 0;
  const maxAttempts = count * 14;
  let i = 0;
  let consecutiveFailures = 0;
  let consecutiveCheckFailures = 0;
  // Tracks a streak of specifically Permanent-memory-match rejections (as
  // opposed to moderation/theme/quality failures) - once an account has
  // enough generation history, common topics genuinely start running out of
  // not-yet-asked obvious facts, and that's the one failure mode a random
  // "vary the angle" retry doesn't reliably escape (see forceObscure below).
  let consecutiveMemoryFailures = 0;

  // PICTURE_TOPICS is a deliberately small, curated pool (15 entries, vs 32
  // for general topics) - it has to be, since only photographable subjects
  // belong in it. That smallness means the same picture topic (e.g. "famous
  // rivers and waterfalls") can come up more than once within one round just
  // from normal launchIndex cycling/retries, and the round-balance check
  // doesn't reliably catch it because two different named waterfalls really
  // are different entities - it's the shared SUBJECT that reads as
  // repetitive to a host, not the specific answer. Tracking which picture
  // topics this round has already tried and skipping straight to the next
  // untried one closes that gap at the source, before it's ever generated,
  // rather than hoping validation catches it after the fact.
  const triedPictureTopics = new Set<string>();
  const pickPictureTopic = (launchIndex: number): string => {
    for (let offset = 0; offset < shuffledPictureTopics.length; offset++) {
      const candidate = shuffledPictureTopics[(launchIndex + offset) % shuffledPictureTopics.length];
      if (!triedPictureTopics.has(candidate)) { triedPictureTopics.add(candidate); return candidate; }
    }
    // Every picture topic already tried this round (more picture slots than
    // the pool has entries) - allow repeats rather than getting stuck.
    return shuffledPictureTopics[launchIndex % shuffledPictureTopics.length];
  };

  // The intended type MIX (e.g. 20% picture, 10% audio for a Regular round)
  // only survives to the final round if retries stay targeted at whichever
  // category is still short. The old approach walked `types[launchIndex %
  // types.length]` forward on every single launch, including retries after a
  // rejection - so once index i wrapped past the end of the list, the NEXT
  // retry just picked up wherever the cycle had drifted to, not the type
  // that actually failed. A harder-to-satisfy category (audio needs a real
  // YouTube match, picture needs a brand-safe Pixabay result and passes a
  // logo/brand filter) fails validation more often than multiple_choice, so
  // its slots kept getting skipped over by the cycle while the loop quietly
  // filled up on easier types instead - the round could hit its target
  // COUNT while still missing most or all of its audio/picture quota, with
  // nothing in the UI to say so. Tracking each category's remaining deficit
  // (target minus accepted-or-in-flight) and always launching the type with
  // the biggest shortfall keeps every retry aimed at the category that
  // actually still needs it.
  const targetCounts: Record<string, number> = {};
  types.forEach(t => { targetCounts[t] = (targetCounts[t] || 0) + 1; });
  const acceptedCounts: Record<string, number> = {};
  const inFlightCounts: Record<string, number> = {};
  const pickNextType = (): string => {
    let best: string | null = null;
    let bestDeficit = 0;
    for (const t of Object.keys(targetCounts)) {
      const deficit = targetCounts[t] - (acceptedCounts[t] || 0) - (inFlightCounts[t] || 0);
      if (deficit > bestDeficit) { bestDeficit = deficit; best = t; }
    }
    // Every category's quota is already covered by accepted+in-flight
    // candidates (can happen with the 2-ahead pipeline near the end of a
    // round) - fall back to whichever type has accepted the fewest so far,
    // rather than defaulting to the first type in the object every time.
    if (!best) {
      best = Object.keys(targetCounts).reduce((a, b) => (acceptedCounts[a] || 0) <= (acceptedCounts[b] || 0) ? a : b);
    }
    return best;
  };

  type PendingCandidate = { type: string; context: GenerationContext; promise: Promise<Question | null> };
  const pending: PendingCandidate[] = [];
  const launchCandidate = () => {
    const launchIndex = i++;
    const type = pickNextType();
    const topic = theme || (
      type === "audio" ? shuffledMusicTopics[launchIndex % shuffledMusicTopics.length]
      : type === "picture" ? pickPictureTopic(launchIndex)
      : shuffledTopics[launchIndex % shuffledTopics.length]
    );
    const context = createGenerationContext(type, Boolean(theme.trim()));
    attempts++;
    inFlightCounts[type] = (inFlightCounts[type] || 0) + 1;
    pending.push({ type, context, promise: generateOne(type, topic, context, { theme, difficulty, roundType, exclusions, forceObscure: consecutiveMemoryFailures >= 4 }) });
  };
  const refillPipeline = () => {
    // Deliberately keeps up to 2 candidates in flight even once `count` is
    // nearly/already covered by good+pending - e.g. a single-question
    // REGENERATE (count=1) used to gate this at `good.length + pending.length
    // < count`, which for count=1 blocked a second candidate from ever
    // launching: candidate 1 had to fully finish (generate + moderation +
    // theme + duplicate + quality checks, all real API round-trips) before
    // candidate 2 could even start, making a run of rejections purely
    // sequential and slow. Running 2 in parallel and taking whichever
    // resolves and validates first cuts that latency roughly in half; the
    // cost is an occasional wasted extra generation call near the very end
    // of a round, which is cheap next to the host's time. Raised from 2 to
    // 3 alongside the MAX_AI_CONCURRENCY increase above - more overlap per
    // round now that the shared global slot count can actually support it.
    while (pending.length < 3 && attempts < maxAttempts) launchCandidate();
  };
  refillPipeline();

  while (good.length < count && pending.length > 0) {
    onProgress?.("Generating and checking question " + (good.length + 1) + " of " + count + "..." + (consecutiveFailures > 0 ? " (retry " + consecutiveFailures + ")" : ""));
    const current = pending.shift()!;
    const { type, context } = current;
    const q = await current.promise;
    inFlightCounts[type] = Math.max(0, (inFlightCounts[type] || 0) - 1);
    if (!q) {
      reportGeneratedFailure(context, type);
      consecutiveFailures++;
      const err = context.error.toLowerCase();
      const isPersistent = err.includes("api_key") || err.includes("api key") || err.includes("unauthorized")
        || err.includes("not logged in") || err.includes("authentication") || err.includes("rate limit")
        || err.includes("too many requests") || consecutiveFailures >= 6;
      if (isPersistent) {
        const finalStatus = "Generation failed after " + consecutiveFailures + " attempts: " + (context.error || "unknown error");
        onProgress?.(finalStatus);
        return { spec, questions: good, report, finalStatus, stoppedEarly: true };
      }
      refillPipeline();
      continue;
    }
    consecutiveFailures = 0;
    onProgress?.("Checking question " + (good.length + 1) + " of " + count + "...");
    const validation = await validateCandidate(q, good, context.report.stages, theme, exclusions);
    // validateCandidate's own duplicate check ran BEFORE the several awaited
    // moderation/quality/memory calls above - during that gap, a sibling
    // round generating at the same time (generateAllRounds runs every
    // selected round concurrently) can land the exact same fact-question and
    // broadcast it into this round's exclusions mid-flight. That broadcast
    // was landing too late to matter, since this candidate had already
    // cleared the earlier check - which is exactly how the same question
    // could reach two different rounds of the same quiz. Re-checking the
    // fingerprint one last time, synchronously, right before commit, closes
    // that window: exclusions.usedFingerprints reflects every accept from
    // every round up to THIS exact instant, no `await` in between.
    if (validation.ok && exclusions.usedFingerprints.has(questionFingerprint(q))) {
      addReportEntry({ outcome: "rejected", questionText: q.question_text, questionType: q.question_type, category: "Duplicate", reason: "Matched a question accepted by another round moments earlier", stages: context.report.stages });
      consecutiveCheckFailures++;
      consecutiveMemoryFailures++;
      refillPipeline();
      continue;
    }
    if (validation.ok) {
      await commitToMemory(q);
      good.push(q);
      acceptedCounts[type] = (acceptedCounts[type] || 0) + 1;
      registerAccepted(exclusions, q);
      onAccept?.(q);
      addReportEntry({ outcome: "accepted", questionText: q.question_text, questionType: q.question_type, category: validation.category, reason: validation.reason, stages: validation.stages });
      consecutiveCheckFailures = 0;
      consecutiveMemoryFailures = 0;
    } else {
      if (validation.category === "Moderation unavailable") {
        addReportEntry({ outcome: "rejected", questionText: q.question_text, questionType: q.question_type, category: validation.category, reason: validation.reason, stages: validation.stages });
        const finalStatus = "Generation stopped because moderation could not be reached. " + validation.reason;
        onProgress?.(finalStatus);
        return { spec, questions: good, report, finalStatus, stoppedEarly: true };
      }
      blacklistRejected(exclusions, q);
      addReportEntry({ outcome: "rejected", questionText: q.question_text, questionType: q.question_type, category: validation.category, reason: validation.reason, stages: validation.stages });
      consecutiveCheckFailures++;
      consecutiveMemoryFailures = (validation.category === "Duplicate" || validation.category === "Permanent memory") ? consecutiveMemoryFailures + 1 : 0;
      const failReason = (validation.reason || "Unknown reason").substring(0, 40);
      onProgress?.("Question " + (good.length + 1) + " failed check (" + failReason + ") - retrying..." + (consecutiveMemoryFailures >= 4 ? " (widening search for a fresh angle)" : ""));
      // Raised from 25: an account with months of generation history
      // legitimately needs more than 25 tries to find a not-yet-used fact on
      // a well-covered topic, especially now that repeated memory-match
      // rejections are actively steered toward deeper-cut, less-obvious
      // facts (forceObscure above) rather than just re-rolling the same
      // random angle - that steering needs room to actually pay off instead
      // of the round giving up right as it starts working.
      if (consecutiveCheckFailures >= 45) {
        const finalStatus = "Generation stalled after " + consecutiveCheckFailures + " questions in a row failing validation (latest: " + validation.category + " — " + (validation.reason || "Unknown reason").substring(0, 60) + "). Got " + good.length + " of " + count + ". This topic/theme may be close to exhausted in your saved question history - try a different or more specific theme. See Generation Report for details.";
        onProgress?.(finalStatus);
        return { spec, questions: good, report, finalStatus, stoppedEarly: true };
      }
    }
    refillPipeline();
  }

  const finalStatus = good.length === count
    ? "Ready - " + good.length + " of " + count + " questions generated."
    : good.length + " of " + count + " questions ready.";
  onProgress?.(finalStatus);
  return { spec, questions: good, report, finalStatus, stoppedEarly: good.length < count };
}

// Batch orchestrator: generates several rounds IN PARALLEL. Each round gets
// its own exclusion-state bundle seeded from the same permanent history, so
// rounds cannot duplicate anything that's ever been used - but to also stop
// two rounds generating AT THE SAME TIME from picking the same brand-new
// question as each other, every round's accepted questions/answers are merged
// into every other round's exclusion bundle as they land (best-effort - a rare
// same-instant collision on two questions with the same underlying fact is
// still possible, exactly as it already is with the single generator run twice
// back-to-back, and is covered by the existing in-round/near-identical checks).
export async function generateAllRounds(
  specs: RoundGenerationSpec[],
  onProgress?: (roundIndex: number, status: string) => void,
  onRoundComplete?: (roundIndex: number, result: RoundGenerationResult) => void,
): Promise<RoundGenerationResult[]> {
  const baseExclusions = await loadUsedQuestions();
  // Give each round its own copy of the shared history so concurrent mutation
  // of arrays/sets from one round's accepted questions never corrupts another
  // round's in-flight state.
  const perRoundExclusions = specs.map(() => ({
    used: [...baseExclusions.used],
    usedFingerprints: new Set(baseExclusions.usedFingerprints),
    usedAnswers: [...baseExclusions.usedAnswers],
    rejectedFingerprints: new Set(baseExclusions.rejectedFingerprints),
    rejectedTexts: new Set(baseExclusions.rejectedTexts),
  }));
  // Broadcasts a just-accepted question from one round into every OTHER
  // round's exclusion bundle immediately, so two rounds generating at the
  // same time can't both land the same brand-new question (e.g. two rounds
  // both accepting "Bat" for "only mammal capable of true flight") before
  // either has been saved to the database. Previously this merge was only
  // described in a comment but never actually implemented.
  const broadcastAccept = (fromIdx: number, q: Question) => {
    perRoundExclusions.forEach((state, j) => {
      if (j === fromIdx) return;
      state.used = [...state.used, q.question_text];
      state.usedFingerprints.add(questionFingerprint(q));
      const normAnswer = (q.correct_answer || "").toLowerCase().trim();
      if (normAnswer) state.usedAnswers = [...state.usedAnswers, normAnswer];
    });
  };
  return Promise.all(
    specs.map(async (spec, idx) => {
      // A single round throwing (network hiccup, unexpected API shape, etc.)
      // must never reject the whole Promise.all - that would silently discard
      // every OTHER round's results too, even ones that already succeeded,
      // and leave the caller's "generating" state stuck forever with nothing
      // saved. Catch here so this round reports itself as failed while every
      // other round keeps running and saving independently.
      try {
        const result = await generateValidatedRound(spec, perRoundExclusions[idx], status => onProgress?.(idx, status), q => broadcastAccept(idx, q));
        onRoundComplete?.(idx, result);
        return result;
      } catch (e) {
        const failResult: RoundGenerationResult = {
          spec,
          questions: [],
          report: [],
          finalStatus: "Generation crashed: " + (e instanceof Error ? e.message : "Unknown error"),
          stoppedEarly: true,
        };
        onProgress?.(idx, failResult.finalStatus);
        onRoundComplete?.(idx, failResult);
        return failResult;
      }
    })
  );
}
