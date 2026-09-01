"use client";
import { useState, useRef, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ImageUploader } from "@/components/ImageUploader";
import { AudioUploader } from "@/components/AudioUploader";
import { PURSUIT_TOTAL_QUESTIONS } from "@/lib/quiz/pursuit";
import { persistPixabayImage } from "@/lib/quiz/persistPixabayImage";
import { buildPixabaySearchQuery, selectMatchingPixabayHit } from "@/lib/quiz/pixabayMatch";
import { HostShell, HostButton, HostInput, Chip, TopSpacer } from "@/components/fable/HostConsole";

const STAGE_BG = "radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118";
const fableSelect: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 14, background: "#150A2E", color: "#fff", border: "1px solid #2E1A52", fontSize: 13, fontFamily: "'Inter',sans-serif", outline: "none" };
const fableTextarea: React.CSSProperties = { padding: "10px 14px", borderRadius: 14, background: "#150A2E", color: "#fff", border: "1px solid #2E1A52", fontSize: 13, fontFamily: "'Inter',sans-serif", outline: "none", resize: "vertical" };

type Question = {
  id?: number;
  // Stable client-side identity for a question while it lives in the editor
  // list. Used as the React key and for remove/replace so list operations act
  // on the exact item regardless of index shifts or concurrent async updates.
  // Not persisted (stripped before saving a round).
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
type GenerationReportEntry = {
  id: string;
  outcome: "accepted" | "rejected";
  questionText: string;
  questionType: string;
  category: string;
  reason: string;
  stages: ValidationResults;
};
type CandidateReport = Omit<GenerationReportEntry, "id" | "outcome" | "category" | "reason">;
type GenerationContext = {
  error: string;
  report: CandidateReport;
};

function emptyValidationResults(hasTheme: boolean, isMedia: boolean): ValidationResults {
  return {
    moderation: { status: "not_run", note: "Not run" },
    theme: hasTheme ? { status: "not_run", note: "Not run" } : { status: "not_applicable", note: "No theme selected" },
    duplicate: { status: "not_run", note: "Not run" },
    balance: { status: "not_run", note: "Not run" },
    memory: { status: "not_run", note: "Not run" },
    quality: { status: "not_run", note: "Not run" },
    media: isMedia ? { status: "not_run", note: "Not run" } : { status: "not_applicable", note: "Not a media question" },
  };
}

function createGenerationContext(type: string, hasTheme: boolean): GenerationContext {
  return {
    error: "",
    report: {
      questionText: "",
      questionType: type,
      stages: emptyValidationResults(hasTheme, type === "picture" || type === "audio"),
    },
  };
}

function stageLabel(stage: ValidationStage): string {
  return ({
    moderation: "Moderation",
    theme: "Theme",
    duplicate: "Duplicate",
    balance: "Round balance",
    memory: "Permanent memory",
    quality: "Final quality",
    media: "Media lookup",
  } satisfies Record<ValidationStage, string>)[stage];
}

const MUSIC_TOPICS = ["80s pop","90s pop","2000s pop","2010s and 2020s pop","classic rock","indie and alternative rock","hip hop and rap","R&B and soul","dance and EDM","disco and funk","UK number one hits","US number one hits","movie theme songs","musical theatre songs","Christmas songs","one-hit wonders","boy bands and girl groups","singer-songwriters","classic 60s and 70s hits","karaoke classics","current chart hits (last 1-2 years)"];
// Same permanent exclusion list as lib/quiz/generateRound.ts (see the
// comment there) - this older single-round generator is a separate code
// path (Codex #10 flagged the two as needing consolidation), so it needs
// its own copy for now rather than silently missing the fix.
const PERMANENT_EXCLUDED_FACTS = [
  "How tall is the Burj Khalifa (world's tallest building)",
  "Which country is this flag from? (Japan)",
  "What is the name of Fred Flintstone's pet dinosaur? (Dino)",
  "Which car brand has a logo featuring a prancing horse? (Ferrari)",
  "Which movie features a character who can see dead people? (The Sixth Sense)",
  "Which comedian played the character David Brent in the original UK version of The Office? (Ricky Gervais)",
  "What is the surname of the chef who created the 'Naked Chef' TV persona? (Oliver / Jamie Oliver)",
];
// Matches lib/quiz/generateRound.ts's PICTURE_TOPICS/pickPictureTopic - this
// page never got that fix, so picture candidates here were drawing from the
// general topic bucket picker (movies, celebrities, logos, video games,
// etc.), most of which aren't photographable subjects a real image search
// can safely match. That mismatch means picture questions from this screen
// have been failing moderation/quality most of the time, wasting API spend
// on retries rather than producing usable questions. Deliberately a small,
// curated pool of actually-photographable subjects.
const PICTURE_TOPICS = ["famous landmarks","world flags","animals and wildlife","iconic buildings","national dishes and cuisine","famous bridges","sports stadiums","big cats and safari animals","dog and cat breeds","famous mountains and natural wonders","tropical destinations","classic desserts and sweets","famous rivers and waterfalls","farm animals","street food dishes"];
const REGULAR_TYPE_WEIGHTS: [string, number][] = [
  ["multiple_choice", 0.25], ["text_answer", 0.20], ["number", 0.15],
  ["sequence", 0.10], ["picture", 0.20], ["audio", 0.10],
];
const REQUIRED_REGULAR_TYPES = ["multiple_choice", "text_answer", "number", "picture", "audio"];

function allocateRegularTypes(count: number): string[] {
  const allocated = count >= REQUIRED_REGULAR_TYPES.length ? [...REQUIRED_REGULAR_TYPES] : [];
  const remaining = count - allocated.length;
  if (remaining <= 0) return shuffle(allocated);
  const raw = REGULAR_TYPE_WEIGHTS.map(([, weight]) => weight * remaining);
  const base = raw.map(Math.floor);
  let remainder = remaining - base.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, index) => ({ index, fraction: value - base[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const { index } of order) {
    if (remainder <= 0) break;
    base[index]++;
    remainder--;
  }
  return shuffle([...allocated, ...REGULAR_TYPE_WEIGHTS.flatMap(([type], index) => Array(base[index]).fill(type))]);
}
// Bucketed, round-robin topic picker so an unthemed round guarantees a
// spread across news/showbiz, movies/TV, music/culture, geography, history,
// sport, and everyday-life categories instead of drawing purely at random
// from one flat 34-entry list (which could clump on movies/music for an
// entire round while geography/history/current news never came up). See
// lib/quiz/generateRound.ts's identical fix for the full explanation. A host
// who wants ONLY one category should still type an explicit theme - this
// only fixes the default "mixed" case. Module-level factory functions (not
// inline in generate()) so both generate() AND topUp() share the exact same
// logic - topUp used to have its own, much weaker random topic draw with no
// category guarantee at all.
const TOPIC_BUCKETS: string[][] = [
  ["breaking and trending mainstream headlines from the last 1-6 months (completed stories only; no politics, war or tragedy)", "recent entertainment news from the last 3-12 months", "celebrity and pop culture moments from the last 3-12 months"],
  ["movies", "TV shows", "celebrities", "awards and records", "reality TV", "theatre and musicals"],
  ["music", "video games", "comedy and humour", "social media and internet", "consumer technology and digital life", "fashion and style"],
  ["geography", "famous landmarks", "travel", "UK culture", "US culture", "international culture"],
  ["simple history", "books and literature", "art and culture", "childhood and nostalgia", "crime and mystery", "royals and politics"],
  ["sport", "football"],
  ["food and drink", "logos and brands", "accessible science and space", "animals", "classic cartoons", "cars and transport", "nature and wildlife"],
];
const TOPICS = TOPIC_BUCKETS.flat();
function createGeneralTopicPicker(): (launchIndex: number) => string {
  const shuffledBuckets = TOPIC_BUCKETS.map(shuffle);
  const tried = new Set<string>();
  return (launchIndex: number): string => {
    const bucket = shuffledBuckets[launchIndex % shuffledBuckets.length];
    for (let offset = 0; offset < bucket.length; offset++) {
      const candidate = bucket[(Math.floor(launchIndex / shuffledBuckets.length) + offset) % bucket.length];
      if (!tried.has(candidate)) { tried.add(candidate); return candidate; }
    }
    for (const b of shuffledBuckets) {
      for (const candidate of b) {
        if (!tried.has(candidate)) { tried.add(candidate); return candidate; }
      }
    }
    return bucket[launchIndex % bucket.length];
  };
}
function createPictureTopicPicker(): (launchIndex: number) => string {
  const shuffledPictureTopics = shuffle(PICTURE_TOPICS);
  const tried = new Set<string>();
  return (launchIndex: number): string => {
    for (let offset = 0; offset < shuffledPictureTopics.length; offset++) {
      const candidate = shuffledPictureTopics[(launchIndex + offset) % shuffledPictureTopics.length];
      if (!tried.has(candidate)) { tried.add(candidate); return candidate; }
    }
    return shuffledPictureTopics[launchIndex % shuffledPictureTopics.length];
  };
}
// Matches lib/quiz/generateRound.ts's RECENCY_SIGNAL - a theme or randomly-
// picked topic whose text itself asks for something current gets routed
// through web search (see callAPI's webSearch param below) instead of the
// model's own (dated) training knowledge.
const RECENCY_SIGNAL = /\bnews\b|current affairs|pop culture|\brecent\b|trending|this year|last year|chart hits|latest hits|new release/i;

// Random angle hints injected per question to push variety - without these, the AI
// tends to default to the single most famous/obvious example for a topic every time
// (e.g. always 'Let It Go' for Disney songs, always 'Circle of Life' for Lion King).
const VARIETY_ANGLES = [
  "from the 1960s or 1970s", "from the 1980s", "from the 1990s", "from the 2000s", "from the 2010s or later",
  "that's a deeper cut, not the most obvious example", "with a British/UK angle", "with a US angle",
  "that's slightly more obscure but still well-known", "involving a lesser-discussed fact about the topic",
  "from a different decade than you'd first think of", "that most people would NOT guess first",
];
const typeLabel: Record<string,string> = { multi_tap:"Multi Tap", multiple_choice:"Multiple Choice", text_answer:"Text Answer", number:"Number", sequence:"Sequence", picture:"Picture Round", audio:"Name That Tune" };

// Candidate generation and independent validators may overlap, but sending every
// request at once can exhaust both Anthropic's concurrency allowance and our own
// per-host API rate limit. Keep a small shared client-side queue across the page.
const MAX_AI_CONCURRENCY = 8;
// The moderation/theme/quality/balance checks below are simple pass/fail
// judgments on already-written content, not creative writing - they never
// needed the full-price generation model. lib/quiz/generateRound.ts already
// routes these to Haiku for exactly that reason; this page's copy of the
// same four validators was never updated to match, so every single-round
// generate/regenerate/top-up on this screen has been paying full Sonnet
// price for checks that cost a fraction as much on Haiku. Matching that fix
// here.
const VALIDATION_MODEL = "claude-haiku-4-5-20251001";
const GENERATION_MODEL = VALIDATION_MODEL;
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
    aiRequestQueue.shift()?.();
  }
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseModelJson<T>(text: string, container: "object" | "array"): T {
  try {
    return JSON.parse(text) as T;
  } catch (originalError) {
    const open = container === "array" ? "[" : "{";
    const close = container === "array" ? "]" : "}";
    const start = text.indexOf(open);
    const end = text.lastIndexOf(close);
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as T;
    }
    throw originalError;
  }
}

// array.sort(() => Math.random() - 0.5) is a well-known broken shuffle - V8's sort
// is stable/insertion-sort-based for small arrays, so a random comparator barely
// moves elements and tends to leave them close to their original order. This was
// why correct answers kept landing on the same early letters (A/B/C) across
// generated questions instead of being evenly distributed. Proper Fisher-Yates:
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Canonical form for comparing question text: trim, lowercase, and collapse
// all runs of whitespace to a single space. Used by both the rejected-question
// blacklist and the exact-duplicate checks so "Whats the  Capital " and
// "what's the capital" compare equal (punctuation aside) rather than slipping
// through on incidental spacing/case differences.
function normalizeQuestionText(s: string): string {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

// Generic stems such as "Name this song" and "Which of these are..." are not
// question identities. The playable payload (answer/options/media subject) is
// what distinguishes them. Canonicalise option order so shuffled choices still
// count as the same underlying question.
function questionFingerprint(q: Question): string {
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

// Stable unique id for a question list item (client-side only).
let uidCounter = 0;
function genUid(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  uidCounter += 1;
  return "q_" + Date.now().toString(36) + "_" + uidCounter;
}

export default function QuestionsPage() {
  const [roundType, setRoundType] = useState("regular");
  const [difficulty, setDifficulty] = useState("mixed");
  const [theme, setTheme] = useState("");
  const [questionCount, setQuestionCount] = useState(15);
  // The Pursuit is always exactly 7 gates. The generator reads this single `count`
  // value, so Pursuit runs the identical pipeline with the length fixed inline —
  // no separate effect or second code path.
  const count = roundType === "pursuit" ? PURSUIT_TOTAL_QUESTIONS : questionCount;
  const [questions, setQuestions] = useState<Question[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualType, setManualType] = useState("multiple_choice");
  const [manualText, setManualText] = useState("");
  const [manualA, setManualA] = useState("");
  const [manualB, setManualB] = useState("");
  const [manualC, setManualC] = useState("");
  const [manualD, setManualD] = useState("");
  const [manualE, setManualE] = useState("");
  const [manualF, setManualF] = useState("");
  const [manualCorrect, setManualCorrect] = useState("");
  const [manualExplanation, setManualExplanation] = useState("");
  const [manualError, setManualError] = useState("");

  function addManualQuestion() {
    if (!manualText.trim()) { setManualError("Please enter the question text"); return; }
    if (!manualCorrect.trim()) { setManualError("Please enter the correct answer"); return; }
    setManualError("");
    const newQ: Question = {
      _uid: genUid(),
      question_text: manualText.trim(),
      question_type: manualType,
      option_a: manualA.trim() || null,
      option_b: manualB.trim() || null,
      option_c: manualC.trim() || null,
      option_d: manualD.trim() || null,
      option_e: manualE.trim() || null,
      option_f: manualF.trim() || null,
      correct_answer: manualCorrect.trim(),
      explanation: manualExplanation.trim(),
      difficulty: difficulty,
      round_type: roundType,
    };
    setQuestions(prev => [...prev, newQ]);
    setManualText(""); setManualA(""); setManualB(""); setManualC(""); setManualD(""); setManualE(""); setManualF(""); setManualCorrect(""); setManualExplanation("");
  }
  const [status, setStatus] = useState("");
  const [generationReport, setGenerationReport] = useState<GenerationReportEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roundName, setRoundName] = useState("");
  const usedRef = useRef<string[]>([]);
  const usedFingerprintsRef = useRef<Set<string>>(new Set());
  // Tracks correct_answer values seen this session (normalised, lowercase).
  // Prevents two questions with the same answer from appearing in the same round
  // even when their question text is completely different - the root cause of
  // the "Bat / Bat" duplicate that slipped through the text-only check.
  const usedAnswersRef = useRef<string[]>([]);
  // Permanent per-session blacklist of the normalised text of every question
  // that was rejected during this generation session (moderation fail, duplicate/
  // quality fail, or manual removal). Once a question lands here it can never be
  // accepted again for the rest of the session, and it is also fed into the
  // generation prompt so the AI is explicitly told not to reproduce it. Survives
  // every retry, top-up and replace within the session; reset when a brand-new
  // Generate run starts.
  const rejectedRef = useRef<Set<string>>(new Set());
  const rejectedTextsRef = useRef<Set<string>>(new Set());
  const dragIdx = useRef<number|null>(null);

  // Record a produced-but-rejected question so it is never regenerated/accepted
  // again this session.
  function blacklistRejected(q: Question) {
    const fingerprint = questionFingerprint(q);
    if (fingerprint) rejectedRef.current.add(fingerprint);
    const text = normalizeQuestionText(q.question_text);
    if (text) rejectedTextsRef.current.add(text);
  }

  function addReportEntry(entry: Omit<GenerationReportEntry, "id">) {
    setGenerationReport(prev => [...prev, { ...entry, id: genUid() }]);
  }

  function reportGeneratedFailure(context: GenerationContext, fallbackType: string) {
    const candidate = context.report;
    const failedStage = (Object.entries(candidate.stages) as [ValidationStage, ValidationResult][]).find(([, result]) => result.status === "failed");
    const category = failedStage ? stageLabel(failedStage[0]) : "Generation format";
    const reason = failedStage?.[1].note || context.error || "The generator did not return a usable candidate";
    addReportEntry({
      outcome: "rejected",
      questionText: candidate.questionText || "Candidate unavailable",
      questionType: candidate.questionType || fallbackType,
      category,
      reason,
      stages: candidate.stages,
    });
  }

  useEffect(() => { loadUsedQuestions(); }, []);

  async function loadUsedQuestions() {
    const supabase = createSupabaseBrowserClient();
    // Reverted: this must stay a permanent, all-time duplicate check with no
    // time cutoff. A time-windowed version was tried to unblock Music
    // generation, but it let genuinely-repeated questions (e.g. the same
    // Lacoste/crocodile-logo question, the same Apprentice/Alan Sugar
    // question) resurface once they aged past the window - never acceptable.
    // The Music generation stall needs a different fix (e.g. relaxing the
    // "must be well-known" bar once the well-known pool is exhausted), not
    // a weaker duplicate check.
    const [{ data: rounds }, { data: bank }, { data: library }] = await Promise.all([
      supabase.from("rounds").select("questions"),
      supabase.from("question_bank").select("question_text,question_type,option_a,option_b,option_c,option_d,option_e,option_f,correct_answer"),
      supabase.from("questions").select("question_text,question_type,option_a,option_b,option_c,option_d,option_e,option_f,correct_answer"),
    ]);
    const used: string[] = [];
    const fingerprints = new Set<string>();
    const remember = (q: Question) => {
      if (q.question_text) used.push(q.question_text);
      fingerprints.add(questionFingerprint(q));
    };
    if (rounds) rounds.forEach((r: {questions: Question[]}) => r.questions?.forEach(remember));
    if (bank) bank.forEach((q) => remember(q as Question));
    if (library) library.forEach((q) => remember(q as Question));
    usedRef.current = used;
    usedFingerprintsRef.current = fingerprints;
  }

  async function callAPI(prompt: string, maxTokens: number = 8000, structuredOutput: boolean = false, webSearch: boolean = false, model?: string) {
    const res = await withAiRequestSlot(() => fetch("/api/generate-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, maxTokens, structuredOutput, webSearch, model }),
    }));
    // TEMPORARY DIAGNOSTIC - read as text first so we can see exactly what our own
    // API route actually returned, instead of res.json() crashing blind on an
    // empty/malformed body with no visibility into why.
    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error("Our own API route returned non-JSON (status " + res.status + "). Raw body (first 500 chars): " + (rawText || "[EMPTY BODY]").slice(0, 500));
    }
    // Anthropic returns an error object (no "content" field) on auth failures, rate
    // limits, etc. Surface the real reason instead of crashing on .filter() of
    // undefined and silently failing through every retry with no useful message.
    if (!data?.content) {
      const reason = data?.error?.message || "Unknown API error";
      throw new Error("API error (status " + res.status + "): " + reason);
    }
    const toolResult = data.content.find((block: {type: string; name?: string}) =>
      block.type === "tool_use" && block.name === "return_validation_result"
    ) as {input?: unknown} | undefined;
    if (structuredOutput && toolResult?.input) return JSON.stringify(toolResult.input);
    const text = data.content.filter((b:{type:string}) => b.type==="text").map((b:{text:string}) => b.text).join("");
    return text.replace(/```json/g,"").replace(/```/g,"").trim();
  }

  async function checkQuestion(q: Question): Promise<{ok: boolean; note: string; unavailable?: boolean}> {
    // Include ALL six options (a–f), not just a–d. Multi Tap questions carry
    // correct_answer as a comma-separated letter key that can reference option_e
    // or option_f (e.g. "b,e"). Previously those two options were omitted here,
    // so the moderator was handed a key referencing options it could not see and
    // rejected the question as "the answer key references a non-existent option"
    // even though the key was valid - failing the whole round. For Multi Tap we
    // also resolve the letter key to the actual option TEXTS so the moderator
    // checks the real answers instead of an opaque "b,e".
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
        return parseModelJson<{ok: boolean; note: string}>(text, "object");
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown moderation error";
        if (attempt === 0) {
          firstError = reason;
          await wait(750);
          continue;
        }
        return {
          ok: false,
          unavailable: true,
          note: "Moderation service unavailable: " + reason + (reason === firstError ? "" : " (first attempt: " + firstError + ")"),
        };
      }
    }
    return { ok: false, unavailable: true, note: "Moderation service unavailable" };
  }

  // Theme Relevance Validator. Runs only when the host supplied a theme/topic.
  // Judges whether the question GENUINELY belongs to the theme: answering must
  // REQUIRE knowledge of the theme AND the answer must belong to the theme (and,
  // for Picture/Audio rounds, the media subject must too). The explanation is
  // deliberately NOT given to the judge and the judge is told to ignore it, so a
  // generic question can never be "made themed" by an explanation that merely
  // name-drops the theme. Applies to every AI-generated round type. Fails OPEN on
  // a verification error so a transient API hiccup never hard-stalls a round.
  async function checkThemeRelevance(q: Question, activeTheme: string): Promise<{ok: boolean; note: string}> {
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
      return parseModelJson<{ok: boolean; note: string}>(text, "object");
    } catch {
      // Fail open - never let a verification hiccup stall a themed round.
      return { ok: true, note: "theme-check-unavailable" };
    }
  }

  // The natural answer a player would actually type/say, resolving letter keys
  // (multiple_choice / sequence / multi_tap) to their option text so the quality
  // judge sees the real answer rather than "b" or "a,c".
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

  // FINAL Quiz Quality Validator - the last gate, run only after moderation,
  // factual/answer validation, duplicate detection, permanent Question Memory,
  // theme validation and picture validation have all passed. An experienced pub
  // quiz host judges the whole question as a player would experience it and only
  // passes an unequivocal YES. Fails OPEN on a verification error so a transient
  // API hiccup never hard-stalls generation.
  async function finalQualityCheck(q: Question): Promise<{ok: boolean; note: string}> {
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
      return parseModelJson<{ok: boolean; note: string}>(text, "object");
    } catch {
      // Fail open - never let a verification hiccup stall generation.
      return { ok: true, note: "quality-check-unavailable" };
    }
  }

  async function generateOne(type: string, topic: string, context: GenerationContext): Promise<Question|null> {
    // Matches lib/quiz/generateRound.ts's isRecencyTopic - covers the two
    // fixed recency topics plus any theme/topic text that itself signals it
    // wants something current (see RECENCY_SIGNAL above).
    const isRecencyTopic = RECENCY_SIGNAL.test(topic);
    context.error = "";
    context.report = {
      questionText: "",
      questionType: type,
      stages: emptyValidationResults(Boolean(theme.trim()), type === "picture" || type === "audio"),
    };
    const typeInstructions: Record<string,string> = {
      multi_tap: "multi_tap: exactly 6 options in option_a through option_f, ALL SIX FILLED IN (never leave an option blank/null). Some are correct answers, some are decoys (wrong). The number of correct answers can be ANY count from 1 up to all 6 - vary it question to question, don't default to the same count every time. correct_answer must be a comma-separated list of the correct option letters in order, e.g. \"b,d,f\" or \"a,c\" or just \"e\" or \"a,b,c,d,e,f\". Make decoys plausible, not obviously wrong.",
      multiple_choice: "multiple_choice: 4 options A/B/C/D, correct_answer is a, b, c, or d",
      text_answer: "text_answer: the correct_answer MUST be a SINGLE word - no spaces, no commas, no \"and\", no \"&\", no \"/\", no multiple names, no multiple items, no hyphen-joined names. If the natural answer would be more than one word, choose a different question whose answer is a single word. All options must be null.",
      number: "number: numeric answer, options null except option_a which has a helpful hint e.g. \"To the nearest 10\"",
      sequence: "sequence: 4 items that have a definite correct chronological/logical order, written into option_a/b/c/d in that correct order. correct_answer must be exactly \"a,b,c,d\" (the order will be randomized programmatically afterward, so always write them in true correct order here).",
      picture: theme.trim()
        ? `picture: create a THEMED picture question for "${theme.trim()}". option_a is a short internal Pixabay search query for a stock-safe REAL subject (landmark/building, animal, flag, food/dish, or stadium); never use logos, people, film stills, characters, album covers or copyrighted artwork. question_text is shown with that image and MUST require specific knowledge of "${theme.trim()}" to answer—the stock image is a meaningful clue, not the answer itself. Do NOT ask generic identification such as "What animal is this?"; that tests general knowledge rather than the theme. Never write "Show teams this image" or reveal the answer. option_b/c/d null; correct_answer must answer the themed question.`
        : "picture: option_a is a short internal Pixabay query for a stock-safe subject: landmark/building, animal, flag, food/dish, or stadium. Never use logos, famous people, film stills, characters, album covers or copyrighted artwork. question_text is a short visual-identification question such as 'Name this landmark' or 'What animal is this?', without naming the subject or saying 'Show teams this image'. option_b/c/d null; correct_answer identifies what is shown.",
      audio: theme.trim()
        ? `audio: create a THEMED music-clip question for "${theme.trim()}". option_a is an internal YouTube search query identifying the exact track. question_text is shown after the clip and MUST require specific knowledge of "${theme.trim()}"—for example "Which animated film features this song?"—rather than merely naming a song that happens to be associated with the theme. Do not reveal the song, artist or answer. option_b/c/d null; correct_answer must answer the themed question.`
        : "audio: option_a is an internal YouTube search query identifying the exact track. question_text is a short question answerable from the clip, such as 'Name this song', 'Which artist performs this song?' or 'What year was it released?'. Do not reveal the title or artist. option_b/c/d null; correct_answer must match what question_text asks.",
    };
    // Cap to last 40 entries AND hard-truncate the assembled text - 150 entries
    // was overflowing the 8000-char prompt limit after enough generation history
    // built up, causing every generation to fail outright with "Prompt too long".
    // Questions rejected during THIS session are listed first so they survive the
    // truncation cap - the AI must be told not to reproduce them (the blacklist in
    // isAcceptable is the hard guard; this just stops wasted retries).
    const rejectedList = Array.from(rejectedTextsRef.current);
    let exclusions = [...rejectedList, ...usedRef.current.slice(-40)].map((q,i) => (i+1)+". "+q).join("; ");
    if (exclusions.length > 3000) exclusions = exclusions.slice(0, 3000);
    const usedAnswersList = usedAnswersRef.current.slice(-30).filter(Boolean).join(", ");
    let exclusionNote = (exclusions || usedAnswersList)
      ? " Do NOT generate any of these already-used questions: " + exclusions + "."
        + (usedAnswersList ? " Also do NOT use any of these already-used answers (even with different question wording): " + usedAnswersList + "." : "")
      : "";
    // Permanently-banned overused facts (see PERMANENT_EXCLUDED_FACTS above) -
    // always included, independent of this session's own exclusion list.
    exclusionNote += " Never generate a question about any of these overused facts, worded any way: " + PERMANENT_EXCLUDED_FACTS.join("; ") + ".";
    // Keep enough room for the longest type instructions (picture/audio) and the
    // first-pass quality guidance under the API route's 8,000-character limit.
    if (exclusionNote.length > 2200) exclusionNote = exclusionNote.slice(0, 2200);
    const angle = VARIETY_ANGLES[Math.floor(Math.random() * VARIETY_ANGLES.length)];
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
${varietyNote}${exclusionNote}

Include a 1-2 sentence explanation of the answer in the explanation field.
Silently check before writing: one array item, every schema key present, unused options null, exact requested type and answer format. Do not write out that checking process - it must not appear anywhere in your reply.
Your entire reply must be ONLY the JSON array itself - no preamble, no "checking..." notes, no explanation of your reasoning, no markdown, nothing before the opening [ or after the closing ]. The very first character of your reply must be [.
Return ONLY a valid JSON array with 1 item, no markdown:
[{"question_text":"...","question_type":"${type}","option_a":"...","option_b":"...","option_c":"...","option_d":"...","option_e":"...","option_f":"...","correct_answer":"...","explanation":"...","difficulty":"${difficulty}","round_type":"${roundType}"}]`;
    try {
      const text = await callAPI(prompt, 1200, false, isRecencyTopic, GENERATION_MODEL);
      let q;
      try {
        q = parseModelJson<Array<Question & Record<string, unknown>>>(text, "array")[0];
      } catch {
        // TEMPORARY DIAGNOSTIC - surface the actual raw text that failed to parse
        // so we can see exactly what Claude returned instead of guessing blind.
        throw new Error("JSON parse failed. Raw text (first 500 chars): " + text.slice(0, 500));
      }
      if (q) { q.question_type = type; }
      if (q) {
        context.report.questionText = q.question_text || "Untitled candidate";
      }
      // THEME RELEVANCE: if the host supplied a theme, every question (of ANY
      // type) must genuinely require knowledge of that theme. Checked here -
      // before any media fetch - so an off-theme candidate is rejected and
      // regenerated via the existing retry system without wasting an image/video
      // lookup. When no theme is supplied, behaviour is unchanged.
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
        // Hard guard, not just a prompt instruction - the AI can still ignore the
        // "no brand logos" instruction occasionally, and Pixabay structurally
        // cannot return trademarked logo images, so any question that slips
        // through gets rejected here and retried as a different question rather
        // than shipped with a guaranteed-wrong image.
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
            // Re-host in our own storage - Pixabay's hotlink URLs are not
            // guaranteed permanent and have been observed going dead over time.
            q.option_b = await persistPixabayImage(pixabayUrl);
            context.report.stages.media = { status: "passed", note: "Pixabay image found" };
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
        // AI models have a well-known bias toward placing the correct multiple
        // choice answer in C - without this shuffle, correct answers cluster
        // heavily on one letter across a generated round instead of being evenly
        // distributed, which is an obvious "tell" for players.
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
        // items[i] is the item that truly belongs at position i (1st, 2nd, 3rd, 4th) -
        // the AI always writes these in true correct order per the prompt above.
        const items = letters.map(l => q["option_" + l]);
        // shuffledLetters[i] = which slot will hold the item that truly belongs at
        // position i. Reading the options in this letter order gives the true sequence.
        const shuffledLetters = shuffle(letters);
        const newOptions: Record<string, unknown> = {};
        shuffledLetters.forEach((slot, i) => { newOptions[slot] = items[i]; });
        letters.forEach(l => { q["option_" + l] = newOptions[l]; });
        q.correct_answer = shuffledLetters.join(",");
      }
      if (q && q.question_type === "multi_tap") {
        const letters = ["a", "b", "c", "d", "e", "f"];
        // Bug fixed here (same fix as lib/quiz/generateRound.ts): `items` was
        // built by filtering nulls out of a-f, but `wasCorrect` was computed
        // against "the first N letters" rather than the ORIGINAL letter each
        // surviving item actually came from - those only matched when the AI
        // left options unfilled from the END, and silently mispaired
        // correctness with the wrong option text whenever a MIDDLE slot
        // (e.g. option_c) was the one left empty. Tracking (letter, value)
        // pairs together removes that possibility.
        const filledPairs = letters
          .map(l => ({ letter: l, value: q["option_" + l] }))
          .filter((p): p is { letter: string; value: string } => p.value !== null && p.value !== undefined && p.value !== "");
        const items = filledPairs.map(p => p.value);
        const correctLetters = (q.correct_answer || "").split(",").map((s: string) => s.trim().toLowerCase());
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
        // Guarantee the answer key is valid before this question can ship:
        // non-empty, and every referenced letter maps to a present (non-null)
        // option. If the AI response produced a key that can't satisfy this
        // (e.g. it referenced an option it never filled in), treat the whole
        // response as invalid and return null so the caller retries generation,
        // rather than emitting a Multi Tap question with a broken answer key.
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
      // Text Answer answers MUST be a single word. This applies ONLY to
      // text_answer - Multi Tap, Higher/Lower, Picture, Audio and every other
      // type are unaffected. Reject (return null) so the caller generates another
      // question if the answer contains a space, comma, "&", "/", the word "and",
      // or hyphen-joined multiple names (i.e. any multi-word / multi-item answer).
      if (q && q.question_type === "text_answer") {
        const ans = (q.correct_answer || "").trim();
        const invalid =
          ans === "" ||
          /\s/.test(ans) ||                            // whitespace = more than one word
          ans.includes(",") ||                         // comma-separated items
          ans.includes("&") ||                         // ampersand joiner
          ans.includes("/") ||                         // slash joiner
          /\band\b/i.test(ans) ||                      // the word "and" as a joiner
          /[A-Za-z]+-[A-Z][a-zA-Z]*/.test(ans);        // hyphen joining multiple names (e.g. Lennon-McCartney)
        if (invalid) {
          context.error = "Text Answer must be a single word (got '" + ans + "') - retrying";
          return null;
        }
      }
      // NOTE: the question is NOT written to the permanent library here. Insertion
      // into the Question Memory happens only when a question is ACCEPTED (see
      // commitToMemory, called from Generate/Top Up/Replace). Writing every raw
      // candidate here previously polluted the permanent library with rejected /
      // moderation-failed questions and made the pre-accept memory check match the
      // candidate against itself.
      // Stamp a stable list identity so remove/replace and React keys act on the
      // exact item, independent of index or concurrent async list updates.
      q._uid = genUid();
      return q;
    } catch (e) {
      context.error = e instanceof Error ? e.message : "Unknown error";
      return null;
    }
  }

  // Converts a questions-table row back into the in-app Question shape,
  // re-inflating option_b from media_url for picture/audio types since that's
  // where the legacy player/display/host rendering code expects to find it.
  function rowToQuestion(row: Record<string, unknown>): Question {
    const isMedia = row.question_type === "picture" || row.question_type === "audio";
    return {
      id: row.id as number,
      question_text: row.question_text as string,
      question_type: row.question_type as string,
      option_a: (isMedia ? null : row.option_a) as string | null,
      option_b: (isMedia ? row.media_url : row.option_b) as string | null,
      option_c: row.option_c as string | null,
      option_d: row.option_d as string | null,
      option_e: row.option_e as string | null,
      option_f: row.option_f as string | null,
      correct_answer: row.correct_answer as string,
      explanation: (row.explanation as string) || "",
      difficulty: (row.difficulty as string) || "mixed",
      round_type: roundType,
    };
  }

  // Smart 70/20/10 question selection from the library, tried before falling
  // back to fresh AI generation. Pool A (never used) gets priority weight, Pool
  // B (used 12+ months ago) is the secondary pool, Pool C (anything else) is a
  // last-resort fallback so a thin library never blocks generation outright -
  // it just means more AI-generated fallback for that slot, exactly like before
  // this feature existed.
  // NOTE: this is global recency-based selection (last_used_at across all
  // venues/hosts), not yet venue-specific - the generator UI doesn't currently
  // have a "which venue/night is this for" field, which true venue-aware
  // exclusion would need. game_history does capture venue_id at play-time
  // already, so venue-aware filtering can be added once that UI control exists.
  // Defensive quality filter applied at selection time, not just generation
  // time - the library can contain rows saved before a prompt/guard fix
  // existed (e.g. old "Show teams this image: ..." host-instruction text baked
  // into question_text, or brand/logo picture questions from before that guard
  // was added). Without this, pickFromLibrary would happily keep recycling that
  // stale bad data forever, since it never gets regenerated once it's sitting
  // in the table with is_active=true.
  function isLibraryRowUsable(row: Record<string, unknown>): boolean {
    const text = ((row.question_text as string) || "").toLowerCase();
    if (text.startsWith("show teams this image") || text.startsWith("play this track")) return false;
    if (row.question_type === "picture" || row.question_type === "audio") {
      if (/\blogo\b|\bbrand\b|\btrademark\b/.test(text)) return false;
    }
    return true;
  }

  // ── Shared duplicate / semantic similarity guard ─────────────────────────
  // Returns true when a question is acceptable (no duplicates found).
  // Used in the generate loop, removeAndReplace, and topUp so all three
  // paths have identical protection - previously only the generate loop had
  // inline checks; the other two paths had none at all.
  // Returns null if the question is acceptable, otherwise a short reason string
  // identifying WHICH rule rejected it. This is the single place the accept/reject
  // logic lives; isAcceptable() is the boolean view of it.
  function duplicateRejectionReason(q: Question, currentRound: Question[]): string | null {
    // Words that are structural quiz scaffolding OR generic to almost any topic.
    // These must NOT count toward "similarity", otherwise every question in a
    // single-theme round looks like a duplicate of every other one.
    const COMMON = new Set([
      // question scaffolding / stopwords
      "what","which","where","when","who","that","this","with","from","have","been","were","they","their","about","only","does","into","than","other","more","over","some","also","after","before","known","the","and","for","are","but","not","you","all","can","had","her","him","his","how","man","new","now","old","see","two","way","boy","did","its","let","put","say","she","too","use","was","your","them","then","here","there","was","are",
      // generic topic nouns/verbs that recur across a themed round
      "film","films","movie","movies","song","songs","music","character","characters","name","named","names","actor","actress","actors","voice","voiced","played","plays","play","called","feature","features","featured","animated","animation","show","shows","series","episode","famous","first","last","title","titled","released","release","year","years","won","wins","winner","story","stories","franchise","sequel","original","company","brand","team","player","country","city","capital","word","words","number",
    ]);
    // Also ignore the chosen theme/topic tokens themselves (e.g. "disney",
    // "90s", "movies") - sharing the theme is expected, not a duplicate signal.
    const themeTokens = (theme || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
    const ignore = new Set<string>([...COMMON, ...themeTokens]);
    const sigWords = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 3 && !ignore.has(w));

    const normAnswer = (q.correct_answer || "").toLowerCase().trim();
    const fingerprint = questionFingerprint(q);

    // a0) Blacklisted earlier this session - never allow the exact same question back.
    if (rejectedRef.current.has(fingerprint)) return "blacklist";

    // a) Exact playable-question duplicate. Generic stems are intentionally not
    // identities on their own; options/answer/media subject form the fingerprint.
    if (usedFingerprintsRef.current.has(fingerprint)) return "exact-question:used-or-history";
    if (currentRound.some(g => questionFingerprint(g) === fingerprint)) return "exact-question:current-round";

    // b) Same answer already used IN THE CURRENT ROUND (genuinely repetitive).
    //    Deliberately scoped to the current round only - NOT to usedAnswersRef,
    //    which accumulates answers from older generation sessions/historical state
    //    and would otherwise make themed replacement impossible.
    if (normAnswer && currentRound.some(g =>
      g.question_type === q.question_type &&
      (g.correct_answer || "").toLowerCase().trim() === normAnswer
    )) return "same-answer:current-round";

    // c) Near-identical wording - high overlap on DISTINCTIVE words only (theme
    //    and common words already stripped). Requires at least 2 shared
    //    distinctive words so incidental overlap or a shared theme word alone
    //    cannot trip it.
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

  // ── Round Balance (within this unthemed round only) ───────────────────────
  // Duplicate detection answers "is this the same question?"; this separate
  // semantic judge answers "would a professional host consider this round
  // repetitive?". It compares only with questions already accepted into the
  // current round, rejects only an explicit high-confidence conflict, and fails
  // open so a transient model/parser problem never lowers generation reliability.
  async function checkRoundBalance(q: Question, currentRound: Question[]): Promise<{
    ok: boolean;
    note: string;
    details: RoundBalanceDetails;
  }> {
    const emptyDetails: RoundBalanceDetails = {
      candidate_subtopic: null,
      candidate_entity: null,
      conflict_index: null,
      rejection_reason: "",
    };
    if (currentRound.length === 0) {
      return { ok: true, note: "First accepted question in round", details: emptyDetails };
    }
    const activeTheme = theme.trim();

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
        ok?: boolean;
        note?: string;
        confidence?: string;
        candidate_subtopic?: string | null;
        candidate_entity?: string | null;
        conflict_index?: number | null;
        rejection_reason?: string;
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
        note: highConfidenceConflict
          ? (details.rejection_reason || "High-confidence repeated subject")
          : (parsed.note || "No high-confidence round-balance conflict"),
        details,
      };
    } catch {
      return { ok: true, note: "Round-balance check unavailable - allowed", details: emptyDetails };
    }
  }

  // ── Permanent Question Memory (cross-session, DB-backed) ───────────────────
  // The authoritative store is the public.questions table; the check runs
  // server-side in Postgres (check_question_memory RPC) so it persists across
  // all sessions/dates and never relies on browser/React state. Returns true if
  // an identical or substantially-similar question already exists in memory.
  // Fails OPEN (returns false) if the RPC/migration isn't available yet, so
  // generation is never hard-blocked by a missing memory backend.
  async function isDuplicateInMemory(q: Question): Promise<boolean> {
    // For structured/media questions the full payload is the identity. The
    // legacy RPC compares question_text only, which makes every "Name this song"
    // or "Which of these..." candidate look identical. loadUsedQuestions has
    // already loaded the permanent questions table into this fingerprint set.
    if (["multiple_choice", "multi_tap", "sequence", "picture", "audio"].includes(q.question_type)) {
      return usedFingerprintsRef.current.has(questionFingerprint(q));
    }
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("check_question_memory", {
        p_text: q.question_text,
        p_type: q.question_type,
        // Raised from 0.6: trigram similarity on raw sentence text (no stopword
        // stripping) was flagging questions that merely share common phrasing
        // ("Which...", "What is the...") as near-duplicates, not just questions
        // that are actually the same content. As the library grew past ~150
        // saved questions this was causing generation to stall almost entirely.
        // 0.82 still catches genuinely reworded repeats, just not every question
        // that happens to start the same way.
        p_threshold: 0.82,
      });
      if (error) { console.error("Question Memory check unavailable (allowing question):", error.message); return false; }
      return data != null; // a matching id means a same/similar question already exists
    } catch (e) {
      console.error("Question Memory check error (allowing question):", e);
      return false;
    }
  }

  async function validateCandidate(q: Question, currentRound: Question[], stages: ValidationResults): Promise<{
    ok: boolean;
    category: string;
    reason: string;
    stages: ValidationResults;
  }> {
    const duplicateReason = duplicateRejectionReason(q, currentRound);
    stages.duplicate = duplicateReason
      ? { status: "failed", note: duplicateReason }
      : { status: "passed", note: "No session or round duplicate" };
    if (duplicateReason) return { ok: false, category: "Duplicate", reason: duplicateReason, stages };

    const memoryDuplicate = await isDuplicateInMemory(q);
    stages.memory = memoryDuplicate
      ? { status: "failed", note: "Matched permanent Question Memory" }
      : { status: "passed", note: "No permanent-memory match" };
    if (memoryDuplicate) return { ok: false, category: "Permanent memory", reason: stages.memory.note, stages };

    const moderationPromise = checkQuestion(q);
    const balancePromise = checkRoundBalance(q, currentRound);
    const qualityPromise = finalQualityCheck(q);

    const [moderation, balance, quality] = await Promise.all([
      moderationPromise,
      balancePromise,
      qualityPromise,
    ]);
    stages.moderation = { status: moderation.ok ? "passed" : "failed", note: moderation.note };
    stages.balance = {
      status: balance.ok ? "passed" : "failed",
      note: balance.note,
      details: balance.details,
    };
    stages.quality = { status: quality.ok ? "passed" : "failed", note: quality.note };

    // Preserve the established rejection priority even though the independent
    // work above completes concurrently.
    if (!moderation.ok) return {
      ok: false,
      category: moderation.unavailable ? "Moderation unavailable" : "Moderation",
      reason: moderation.note,
      stages,
    };
    if (balance && !balance.ok) return { ok: false, category: "Round balance", reason: balance.note, stages };
    if (!quality.ok) return { ok: false, category: "Final quality", reason: quality.note, stages };

    return { ok: true, category: "Accepted", reason: "Passed every applicable validation stage", stages };
  }

  // Persist an ACCEPTED question into the permanent Question Memory and attach
  // its library id. Idempotent (unique on question_text,question_type).
  async function commitToMemory(q: Question) {
    try {
      const supabase = createSupabaseBrowserClient();
      const libRow = {
        question_text: q.question_text,
        correct_answer: q.correct_answer,
        option_a: ["picture","audio"].includes(q.question_type) ? null : q.option_a,
        option_b: ["picture","audio"].includes(q.question_type) ? null : q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        option_e: q.option_e,
        option_f: q.option_f,
        explanation: q.explanation,
        difficulty: q.difficulty,
        question_type: q.question_type,
        media_url: ["picture","audio"].includes(q.question_type) ? q.option_b : null,
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
          .ilike("question_text", q.question_text)
          .eq("question_type", q.question_type)
          .maybeSingle();
        if (existing?.id) q.id = existing.id;
      }
    } catch (libErr) {
      console.error("Failed to save question to permanent memory:", libErr);
    }
  }

  function registerAccepted(q: Question) {
    usedRef.current = [...usedRef.current, q.question_text];
    usedFingerprintsRef.current.add(questionFingerprint(q));
    const normAnswer = (q.correct_answer || "").toLowerCase().trim();
    if (normAnswer) usedAnswersRef.current = [...usedAnswersRef.current, normAnswer];
  }

  async function pickFromLibrary(type: string, excludeIds: Set<number>): Promise<Question | null> {
    const supabase = createSupabaseBrowserClient();
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: poolA }, { data: poolB }, { data: poolC }] = await Promise.all([
      supabase.from("questions").select("*").eq("question_type", type).eq("is_active", true).is("last_used_at", null).limit(50),
      supabase.from("questions").select("*").eq("question_type", type).eq("is_active", true).lt("last_used_at", cutoff).limit(50),
      supabase.from("questions").select("*").eq("question_type", type).eq("is_active", true).gte("last_used_at", cutoff).order("last_used_at", { ascending: true }).limit(50),
    ]);
    const filterEx = (arr: Record<string, unknown>[] | null) => (arr || []).filter(r => !excludeIds.has(r.id as number) && isLibraryRowUsable(r));
    const a = filterEx(poolA), b = filterEx(poolB), c = filterEx(poolC);
    if (a.length === 0 && b.length === 0 && c.length === 0) return null;
    const roll = Math.random();
    let pool = a.length ? a : (b.length ? b : c);
    if (roll < 0.7 && a.length) pool = a;
    else if (roll < 0.9 && b.length) pool = b;
    else if (c.length) pool = c;
    if (!pool.length) pool = a.length ? a : (b.length ? b : c);
    const row = pool[Math.floor(Math.random() * pool.length)];
    return rowToQuestion(row);
  }

  async function generate() {
    setLoading(true);
    setQuestions([]);
    setGenerationReport([]);
    setRoundName("");
    // Fresh generation session: start the rejected-question blacklist empty so it
    // only reflects questions rejected during this run (it then persists across
    // every retry, top-up and replace until the next Generate).
    rejectedRef.current = new Set();
    rejectedTextsRef.current = new Set();
    let types: string[];
    if (roundType === "music") {
      types = Array(count).fill("audio");
    } else if (roundType === "multi_tap") {
      types = Array(count).fill("multi_tap");
    } else if (roundType === "pursuit") {
      // The Pursuit runs on the standard, text-answerable question types (no
      // picture/audio, whose media the race board doesn't display), 7 gates.
      types = shuffle(Array.from({ length: count }, (_, i) =>
        ["multiple_choice", "text_answer", "number", "sequence"][i % 4]
      ));
    } else if (roundType === "hot_seat") {
      // Every Hot Seat candidate must be completely answerable from the shared
      // question and the winning handset; media rounds retain their dedicated
      // display/playback workflows.
      types = shuffle(Array.from({ length: count }, (_, i) =>
        ["multiple_choice", "text_answer", "number", "sequence"][i % 4]
      ));
    } else {
      // Guarantee the five commercial core formats once a round has at least
      // five questions, then distribute remaining slots by largest remainder.
      // This prevents a short regular round from silently omitting music or a
      // number answer because percentage rounding happened to favour another
      // category.
      // Largest-remainder allocation instead of independently Math.round()-ing
      // each category then giving audio whatever's left over. Rounding every
      // OTHER category up first could already overshoot the full count (e.g.
      // count=10: mc round(2.5)=3, ta round(2)=2, num round(1.5)=2, seq
      // round(1)=1, pic round(2)=2 - that's 10 already), leaving audio's
      // subtraction at exactly 0 - so a whole category (and sometimes two)
      // silently vanished from every round while multiple_choice kept its
      // full share, which is exactly why hosts were seeing mostly multiple
      // choice with picture/audio/sequence barely showing up. Mirrors the fix
      // already applied in lib/quiz/generateRound.ts - see that file's
      // comment for the full explanation.
      types = allocateRegularTypes(count);
    }
    const pickGeneralTopic = createGeneralTopicPicker();
    const pickPictureTopic = createPictureTopicPicker();
    const shuffledMusicTopics = shuffle(MUSIC_TOPICS);
    const good: Question[] = [];
    // Always generate fresh AI questions - the Phase 1 library-first selection
    // was silently recycling all backfilled historical questions (including ones
    // the host personally wrote) because the backfill migration pulled every
    // question from every past round into the library. This made "Generate Round"
    // return old questions instead of fresh AI content, which is the wrong
    // behavior. Library reuse belongs in a separate explicit workflow, not as a
    // silent override of generation. The library and game_history tracking still
    // work correctly for repeat-prevention auditing; they just no longer hijack
    // the generate button.
    const usedLibraryIds = new Set<number>();
    let attempts = 0;
    // This screen's retry ceiling was noticeably tighter than the bulk
    // generator's (count*8/consecutiveCheckFailures>=15 here vs. count*18-24
    // and 45 there) with no wall-clock bail-out at all - so a host could be
    // watching "Checking question X..." indefinitely on a genuinely slow
    // request with no time-based safety net, while also giving up sooner
    // than necessary on a recoverable retry streak. Matching both to
    // generateRound.ts's tuned values.
    const maxAttempts = count * 18;
    const generationStartedAt = Date.now();
    const wallClockBudgetMs = Math.max(120_000, count * 25_000);
    let i = 0;
    let consecutiveFailures = 0;
    let consecutiveCheckFailures = 0;
    // Keep retries targeted at whichever category still has a shortfall,
    // rather than cycling `types[launchIndex % types.length]` forward on
    // every single attempt including retries - that old approach let a
    // harder-to-satisfy category (audio needs a real YouTube match; picture
    // needs a brand-safe Pixabay result) get quietly skipped over by easier
    // types once the cycle drifted past it, so a round could hit its target
    // COUNT while still missing most or all of its audio/picture quota, with
    // no indication anything was short. See generateRound.ts's identical fix
    // for the full explanation.
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
      if (!best) {
        best = Object.keys(targetCounts).reduce((a, b) => (acceptedCounts[a] || 0) <= (acceptedCounts[b] || 0) ? a : b);
      }
      return best;
    };
    type PendingCandidate = {
      type: string;
      context: GenerationContext;
      promise: Promise<Question | null>;
    };
    const pending: PendingCandidate[] = [];
    const launchCandidate = () => {
      const launchIndex = i++;
      const type = pickNextType();
      const topic = theme || (
        type === "audio" ? shuffledMusicTopics[launchIndex % shuffledMusicTopics.length]
        : type === "picture" ? pickPictureTopic(launchIndex)
        : pickGeneralTopic(launchIndex)
      );
      const context = createGenerationContext(type, Boolean(theme.trim()));
      attempts++;
      inFlightCounts[type] = (inFlightCounts[type] || 0) + 1;
      pending.push({ type, context, promise: generateOne(type, topic, context) });
    };
    const refillPipeline = () => {
      while (pending.length < 2 && attempts < maxAttempts && good.length + pending.length < count) {
        launchCandidate();
      }
    };

    refillPipeline();
    while (good.length < count && pending.length > 0) {
      // No time-based safety net previously existed here at all - only a
      // candidate-count ceiling (maxAttempts) and a consecutive-failure
      // streak counter, neither of which bounds real wall-clock time if
      // individual requests are just slow rather than failing outright. A
      // host could be watching this status line for minutes with no idea if
      // it's still working or effectively stalled. Matches generateRound.ts's
      // budget so this screen can't hang indefinitely either.
      if (Date.now() - generationStartedAt > wallClockBudgetMs) {
        setStatus("Generation stopped after " + Math.round((Date.now() - generationStartedAt) / 1000) + "s to avoid an excessive wait. Got " + good.length + " of " + count + " - use Top Up to fill the rest.");
        setLoading(false);
        return;
      }
      setStatus("Generating and checking question " + (good.length + 1) + " of " + count + "..." + (consecutiveFailures > 0 ? " (retry " + consecutiveFailures + ")" : ""));
      const current = pending.shift()!;
      const { type, context } = current;
      const q = await current.promise;
      inFlightCounts[type] = Math.max(0, (inFlightCounts[type] || 0) - 1);
      if (!q) {
        reportGeneratedFailure(context, type);
        consecutiveFailures++;
        // Bail for errors retrying genuinely can't fix (bad key, not logged in,
        // rate limited) - OR after 6 failures in a row regardless of the reason,
        // since that many consecutive failures means something systemic is wrong,
        // not just a one-off blip, and silently grinding through 60+ attempts
        // with zero visible feedback just looks frozen.
        const err = context.error.toLowerCase();
        const isPersistent = err.includes("api_key") || err.includes("api key") || err.includes("unauthorized")
          || err.includes("not logged in") || err.includes("authentication") || err.includes("rate limit")
          || err.includes("too many requests") || consecutiveFailures >= 6;
        if (isPersistent) {
          setStatus("Generation failed after " + consecutiveFailures + " attempts: " + (context.error || "unknown error"));
          setLoading(false);
          return;
        }
        refillPipeline();
        continue;
      }
      consecutiveFailures = 0;
      setStatus("Checking question " + (good.length + 1) + " of " + count + "...");
      const validation = await validateCandidate(q, good, context.report.stages);
      // Gate order: moderation -> in-round duplicate detection -> Round Balance
      // (unthemed rounds only) -> permanent Question Memory (cross-session) ->
      // FINAL quiz quality check. Each stage is short-circuited so the expensive
      // AI checks only run once the cheaper ones pass; the final quality judge is
      // the very last gate before acceptance.
      if (validation.ok) {
        await commitToMemory(q); // accepted -> becomes part of permanent memory
        good.push(q);
        acceptedCounts[type] = (acceptedCounts[type] || 0) + 1;
        registerAccepted(q);
        // Append functionally to the LIVE list instead of replacing it with a
        // snapshot of `good`. A full `setQuestions([...good])` here would resurrect
        // any question the user removed (via removeAndReplace) while this loop was
        // still running, because `good` has no knowledge of that removal. Appending
        // by prev keeps concurrent removals intact.
        setQuestions(prev => prev.some(x => x._uid === q._uid) ? prev : [...prev, q]);
        addReportEntry({ outcome: "accepted", questionText: q.question_text, questionType: q.question_type, category: validation.category, reason: validation.reason, stages: validation.stages });
        consecutiveCheckFailures = 0;
      } else {
        if (validation.category === "Moderation unavailable") {
          addReportEntry({ outcome: "rejected", questionText: q.question_text, questionType: q.question_type, category: validation.category, reason: validation.reason, stages: validation.stages });
          setStatus("Generation stopped because moderation could not be reached. " + validation.reason);
          setLoading(false);
          return;
        }
        // Permanently blacklist this exact question for the rest of the session
        // so the retry can never reproduce it (and the AI is told to avoid it).
        blacklistRejected(q);
        addReportEntry({ outcome: "rejected", questionText: q.question_text, questionType: q.question_type, category: validation.category, reason: validation.reason, stages: validation.stages });
        consecutiveCheckFailures++;
        const failReason = validation.reason.substring(0,40);
        setStatus("Question " + (good.length + 1) + " failed check (" + failReason + ") - retrying...");
        // Same logic as generateOne failures above - if questions keep failing the
        // safety/duplicate check over and over, that's systemic (e.g. exclusion
        // list too aggressive, or the moderator prompt rejecting too much), not a
        // one-off blip. Bailing with a clear message beats silently grinding
        // through dozens of slow retries that look identical to "frozen".
        if (consecutiveCheckFailures >= 15) {
          setStatus("Generation stalled after " + consecutiveCheckFailures + " questions in a row failing validation (latest: " + validation.category + " — " + validation.reason.substring(0,60) + "). Got " + good.length + " of " + count + ". See Generation Report for details.");
          setLoading(false);
          return;
        }
      }
      refillPipeline();
    }
    setLoading(false);
    if (good.length === count) {
      setStatus("Ready! Drag to reorder, then name and save your round.");
    } else {
      setStatus(good.length + " of " + count + " questions ready. Click Top Up to fill remaining slots.");
    }
  }

  // Max replacement attempts before giving up and leaving the ORIGINAL question
  // in place (the round never ends short because of a failed replacement).
  const MAX_REPLACE_ATTEMPTS = 20;

  // Removes a question immediately - no AI regeneration in the loop, so it
  // can never look "stuck" or silently fail if a replacement can't be
  // generated. The round is simply one question short afterwards; use
  // "Top Up" to fill it back in on your own schedule.
  function removeQuestion(i: number) {
    const removed = questions[i];
    if (!removed) return;
    blacklistRejected(removed);
    setQuestions(prev => prev.filter((_, idx) => idx !== i));
  }

  async function removeAndReplace(i: number) {
    const removed = questions[i];
    if (!removed) return;
    const removedUid = removed._uid;

    // IMPORTANT: do NOT remove the question yet. Generate a valid replacement
    // FIRST, keep the original visible the whole time, and only swap it out
    // atomically once we actually have a good replacement. Removing first (the
    // old behaviour) left the round one short whenever every replacement attempt
    // failed.

    // Blacklist the removed question up front so no replacement attempt can hand
    // back the same question (the AI is told to avoid it and isAcceptable rejects
    // it), but this does not touch the visible list.
    blacklistRejected(removed);

    setStatus("Finding replacement...");
    const topicList = shuffle(TOPICS);
    let newQ: Question | null = null;
    let lastReplacementError = "";

    // Keep requesting genuinely new questions through every rejection reason
    // (AI produced nothing/invalid, moderation reject, duplicate reject) until we
    // get a valid one or hit the retry ceiling.
    for (let attempt = 0; attempt < MAX_REPLACE_ATTEMPTS && !newQ; attempt++) {
      setStatus("Finding replacement... (attempt " + (attempt + 1) + " of " + MAX_REPLACE_ATTEMPTS + ")");
      const replaceTopic = theme || topicList[attempt % topicList.length];
      const context = createGenerationContext(removed.question_type, Boolean(theme.trim()));
      const candidate = await generateOne(removed.question_type, replaceTopic, context);
      if (!candidate) {
        lastReplacementError = context.error;
        reportGeneratedFailure(context, removed.question_type);
        continue;
      } // AI produced nothing/invalid - try again
      // Compare against every OTHER question currently in the round (excluding the
      // one being replaced) so the replacement isn't rejected for matching the
      // very item it is swapping out.
      const currentRound = questions.filter(x => x._uid !== removedUid);
      const validation = await validateCandidate(candidate, currentRound, context.report.stages);
      if (validation.ok) {
        newQ = candidate;
        addReportEntry({ outcome: "accepted", questionText: candidate.question_text, questionType: candidate.question_type, category: validation.category, reason: validation.reason, stages: validation.stages });
      } else {
        if (validation.category === "Moderation unavailable") {
          addReportEntry({ outcome: "rejected", questionText: candidate.question_text, questionType: candidate.question_type, category: validation.category, reason: validation.reason, stages: validation.stages });
          setStatus("Replacement stopped because moderation could not be reached. " + validation.reason);
          return;
        }
        addReportEntry({ outcome: "rejected", questionText: candidate.question_text, questionType: candidate.question_type, category: validation.category, reason: validation.reason, stages: validation.stages });
        blacklistRejected(candidate); // in-round/memory duplicate or final-quality reject - keep trying
      }
    }

    if (!newQ) {
      // Every attempt failed: leave the ORIGINAL question exactly where it is so
      // the round keeps its full count, and report a proper error.
      setStatus("Couldn't generate a replacement after " + MAX_REPLACE_ATTEMPTS + " tries - the original question is kept. Try Remove again."
        + (lastReplacementError ? " (last error: " + lastReplacementError + ")" : ""));
      return;
    }

    // We have a valid replacement. Now commit the removal bookkeeping for the old
    // question and swap it out atomically, in place, keeping its position.
    const replacement: Question = newQ;
    await commitToMemory(replacement); // accepted -> becomes part of permanent memory
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.from("question_bank").insert({
        question_text: removed.question_text, question_type: removed.question_type,
        option_a: removed.option_a, option_b: removed.option_b,
        option_c: removed.option_c, option_d: removed.option_d,
        correct_answer: removed.correct_answer, difficulty: removed.difficulty,
        round_type: removed.round_type,
      });
    } catch(e) { console.error("Bank insert failed:", e); }
    registerAccepted(removed); // tracks both text and answer so future questions can't repeat this fact
    registerAccepted(replacement);
    setQuestions(prev => {
      if (prev.some(x => x._uid === replacement._uid)) return prev; // guard double-invoke
      const idx = removedUid ? prev.findIndex(x => x._uid === removedUid) : i;
      const copy = [...prev];
      if (idx === -1) {
        // Original somehow already gone - just place the replacement at its
        // remembered index rather than dropping it.
        copy.splice(Math.min(Math.max(i, 0), copy.length), 0, replacement);
      } else {
        copy.splice(idx, 1, replacement); // atomic in-place replacement, same position
      }
      return copy;
    });
    setStatus("Replaced!");
    setTimeout(() => setStatus(""), 2000);
  }

  async function topUp() {
    const current = questions;
    const needed = count - current.length;
    if (needed <= 0) return;
    setStatus("Topping up " + needed + " question(s)...");
    // Must match the same round-type-aware type selection used in generate() -
    // otherwise Music/Multi Tap rounds get topped up with generic mixed question
    // types instead of the correct format for that round. This previously
    // claimed to match generate()'s type mix but actually excluded
    // picture/audio entirely for Regular rounds (generate() gives them a real
    // 20%/10% share) - a host topping up a Regular round could never get a
    // picture or audio question that way, only the four text-based types.
    const types =
      roundType === "music" ? ["audio"] :
      roundType === "multi_tap" ? ["multi_tap"] :
      ["multiple_choice","multiple_choice","text_answer","text_answer","number","sequence","picture","picture","audio"];
    const musicTopicList = shuffle(MUSIC_TOPICS);
    const pickGeneralTopic = createGeneralTopicPicker();
    const pickPictureTopic = createPictureTopicPicker();
    const added: Question[] = [];
    let attempts = 0;
    while (added.length < needed && attempts < needed * 6) {
      attempts++;
      const type = types[attempts % types.length];
      const topic = type === "audio" ? musicTopicList[attempts % musicTopicList.length]
        : type === "picture" ? pickPictureTopic(attempts)
        : pickGeneralTopic(attempts);
      const context = createGenerationContext(type, Boolean(theme.trim()));
      const q = await generateOne(type, topic, context);
      if (!q) { reportGeneratedFailure(context, type); continue; }
      const currentForTopup = [...questions, ...added];
      const validation = await validateCandidate(q, currentForTopup, context.report.stages);
      if (validation.ok) {
        await commitToMemory(q); // accepted -> becomes part of permanent memory
        registerAccepted(q);
        added.push(q);
        setQuestions(prev => [...prev, q]);
        addReportEntry({ outcome: "accepted", questionText: q.question_text, questionType: q.question_type, category: validation.category, reason: validation.reason, stages: validation.stages });
      } else {
        if (validation.category === "Moderation unavailable") {
          addReportEntry({ outcome: "rejected", questionText: q.question_text, questionType: q.question_type, category: validation.category, reason: validation.reason, stages: validation.stages });
          setStatus("Top Up stopped because moderation could not be reached. " + validation.reason);
          return;
        }
        addReportEntry({ outcome: "rejected", questionText: q.question_text, questionType: q.question_type, category: validation.category, reason: validation.reason, stages: validation.stages });
        blacklistRejected(q);
      }
    }
    setStatus(added.length === needed ? "Ready! Drag to reorder, then name and save." : "Added " + added.length + " of " + needed + " needed.");
  }

  async function saveRound() {
    if (!roundName.trim()) { setStatus("Please enter a round name first!"); return; }
    if (questions.length === 0) { setStatus("No questions to save!"); return; }
    setSaving(true);
    const supabase = createSupabaseBrowserClient();
    // Strip the client-only _uid so it is never persisted into the round JSON.
    const questionsToSave = questions.map(q => { const copy = { ...q }; delete copy._uid; return copy; });
    const { error } = await supabase.from("rounds").insert({
      name: roundName.trim(), round_type: roundType, difficulty: difficulty, questions: questionsToSave,
    });
    setSaving(false);
    if (error) { setStatus("Save failed: " + error.message); return; }
    setStatus("Round saved!");
    setQuestions([]);
    setRoundName("");
    loadUsedQuestions();
  }

  const onDragStart = (i: number) => { dragIdx.current = i; };
  const onDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === i) return;
    const reordered = [...questions];
    const [moved] = reordered.splice(dragIdx.current, 1);
    reordered.splice(i, 0, moved);
    dragIdx.current = i;
    setQuestions(reordered);
  };
  const onDragEnd = () => { dragIdx.current = null; };

  const acceptedReport = generationReport.filter(entry => entry.outcome === "accepted");
  const rejectedReport = generationReport.filter(entry => entry.outcome === "rejected");
  const rejectionCounts = rejectedReport.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.category] = (counts[entry.category] || 0) + 1;
    return counts;
  }, {});

  return (
    <HostShell>
      <div style={{ height:"100dvh", overflowY:"auto", WebkitOverflowScrolling:"touch" as const, background:STAGE_BG, color:"#fff", padding:"24px", maxWidth:980, margin:"0 auto", boxSizing:"border-box" as const }}>
        {/* TOP BAR */}
        <div className="fbh-top" style={{ border:"1px solid #2E1A52", borderRadius:16, marginBottom:20 }}>
          <span className="fbh-wm" style={{ fontSize:16 }}><span className="q">QUIZ-</span>IT</span>
          <span className="fbh-bc">AI Question Generation</span>
          <TopSpacer />
          <a className="fbh-btn" href="/host/events">Events</a>
          <a className="fbh-btn" href="/host/rounds">Round Library</a>
        </div>

        {/* GENERATOR PANEL */}
        <div className="fbh-panel">
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
            <div>
              <div className="fbh-lbl">Round Type</div>
              <select value={roundType} onChange={e => setRoundType(e.target.value)} style={fableSelect}>
                <option value="regular">Regular round</option>
                <option value="bonus">Bonus / themed</option>
                <option value="music">Music round</option>
                <option value="multi_tap">Multi Tap round</option>
                <option value="pursuit">The Pursuit</option>
                <option value="hot_seat">Hot Seat</option>
              </select>
            </div>
            <div>
              <div className="fbh-lbl">Questions</div>
              {roundType === "pursuit" ? (
                <div style={{ ...fableSelect, color:"#6B5A8E" }}>7 questions (fixed)</div>
              ) : (
                <select value={count} onChange={e => setQuestionCount(parseInt(e.target.value))} style={fableSelect}>
                  {[5,10,15].map(c => <option key={c} value={c}>{c} questions</option>)}
                </select>
              )}
            </div>
            <div>
              <div className="fbh-lbl">Difficulty</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {["easy","medium","hard","mixed"].map(d => (
                  <Chip key={d} on={difficulty===d} onClick={() => setDifficulty(d)}>{d}</Chip>
                ))}
              </div>
            </div>
          </div>
          {roundType === "pursuit" && (
            <div style={{ marginBottom:16, padding:"12px 16px", borderRadius:14, background:"rgba(190,38,193,0.08)", border:"1px solid #8A1B8D" }}>
              <div style={{ fontFamily:"'Bruno Ace SC',var(--font-logo),cursive", fontSize:14, color:"#D94FDC", letterSpacing:".14em", marginBottom:8 }}>THE PURSUIT</div>
              <ul style={{ margin:0, paddingLeft:18, font:"400 13px 'Inter'", lineHeight:1.6, color:"#B9A8D9" }}>
                <li>Every team races through all seven questions at once — each correct answer moves your runner one gate forward.</li>
                <li>One wrong answer and you&rsquo;re out of the pursuit (you stay on the board, frozen). Multiple teams can finish.</li>
                <li>Scoring climbs 10, 20, 30&hellip; up to a 100-point payout for clearing all seven.</li>
              </ul>
            </div>
          )}
          {roundType === "hot_seat" && (
            <div style={{ marginBottom:16, padding:"12px 16px", borderRadius:14, background:"rgba(255,83,101,0.08)", border:"1px solid rgba(255,83,101,0.5)" }}>
              <div style={{ fontFamily:"'Bruno Ace SC',var(--font-logo),cursive", fontSize:14, color:"#ff8290", letterSpacing:".14em", marginBottom:8 }}>HOT SEAT</div>
              <ul style={{ margin:0, paddingLeft:18, font:"400 13px 'Inter'", lineHeight:1.6, color:"#B9A8D9" }}>
                <li>First team to buzz gets 15 seconds to answer on its handset.</li>
                <li>A wrong answer or timeout locks that team out and reopens the buzz.</li>
                <li>The first correct team earns the full question points.</li>
              </ul>
            </div>
          )}
          <div style={{ marginBottom:16 }}>
            <div className="fbh-lbl">Theme / Topic (optional)</div>
            <HostInput value={theme} onChange={e => setTheme(e.target.value)} placeholder="e.g. 90s movies, space… leave blank for random variety" />
          </div>
          <HostButton onClick={() => setManualOpen(!manualOpen)} style={{ width:"100%", marginBottom:12 }}>
            {manualOpen ? "Hide Manual Question Entry" : "+ Add a Question Manually"}
          </HostButton>

          {manualOpen && (
            <div className="fbh-panel" style={{ display:"flex", flexDirection:"column" as const, gap:10 }}>
              <select value={manualType} onChange={e => setManualType(e.target.value)} style={fableSelect}>
                <option value="multiple_choice">Multiple Choice</option>
                <option value="text_answer">Text Answer</option>
                <option value="number">Number</option>
                <option value="sequence">Sequence</option>
                <option value="multi_tap">Multi Tap</option>
              </select>
              <textarea value={manualText} onChange={e => setManualText(e.target.value)} placeholder="Question text…" rows={2} style={fableTextarea} />
              {(manualType === "multiple_choice" || manualType === "sequence" || manualType === "multi_tap") && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <HostInput value={manualA} onChange={e => setManualA(e.target.value)} placeholder="Option A" />
                  <HostInput value={manualB} onChange={e => setManualB(e.target.value)} placeholder="Option B" />
                  <HostInput value={manualC} onChange={e => setManualC(e.target.value)} placeholder="Option C" />
                  <HostInput value={manualD} onChange={e => setManualD(e.target.value)} placeholder="Option D" />
                  {manualType === "multi_tap" && (
                    <>
                      <HostInput value={manualE} onChange={e => setManualE(e.target.value)} placeholder="Option E" />
                      <HostInput value={manualF} onChange={e => setManualF(e.target.value)} placeholder="Option F" />
                    </>
                  )}
                </div>
              )}
              <HostInput value={manualCorrect} onChange={e => setManualCorrect(e.target.value)}
                placeholder={manualType === "multiple_choice" ? "Correct answer letter, e.g. b" : manualType === "sequence" ? "Correct order, e.g. a,b,c,d" : manualType === "multi_tap" ? "Correct letters, e.g. b,d,f" : "Correct answer"} />
              <HostInput value={manualExplanation} onChange={e => setManualExplanation(e.target.value)} placeholder="Explanation (optional)" />
              {manualError && <p style={{ color:"#FF3B4E", font:"400 13px 'Inter'" }}>{manualError}</p>}
              <HostButton variant="pri" onClick={addManualQuestion}>Add to List</HostButton>
            </div>
          )}

          <HostButton variant="pri" big onClick={generate} disabled={loading} style={{ width:"100%" }}>
            {loading ? "GENERATING…" : "GENERATE ROUND"}
          </HostButton>
        </div>

        {status && <p style={{ textAlign:"center", color:"#D94FDC", font:"600 13px 'Inter'", letterSpacing:".08em", marginBottom:16 }}>{status}</p>}

        {generationReport.length > 0 && (
          <section className="fbh-panel" aria-labelledby="generation-report-title">
            <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:16, flexWrap:"wrap", marginBottom:16 }}>
              <div>
                <div className="fbh-lbl">Diagnostics</div>
                <h2 id="generation-report-title" style={{ margin:0, font:"700 22px 'Inter'", color:"#fff" }}>Generation Report</h2>
              </div>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                <span style={{ padding:"8px 12px", borderRadius:12, background:"rgba(46,224,110,0.12)", border:"1px solid rgba(46,224,110,0.35)", color:"#2EE06E", font:"700 15px 'Inter'" }}>{acceptedReport.length} accepted</span>
                <span style={{ padding:"8px 12px", borderRadius:12, background:"rgba(255,59,78,0.10)", border:"1px solid rgba(255,59,78,0.35)", color:"#FF7280", font:"700 15px 'Inter'" }}>{rejectedReport.length} rejected</span>
              </div>
            </div>

            {rejectedReport.length > 0 && (
              <div style={{ marginBottom:18 }}>
                <div className="fbh-lbl">Rejections by category ({rejectedReport.length} total)</div>
                <div style={{ display:"grid", gap:8, marginTop:6 }}>
                  {Object.entries(rejectionCounts).map(([category, total]) => {
                    const examples = Array.from(new Set(rejectedReport.filter(e => e.category === category).map(e => e.reason))).slice(0, 3);
                    return (
                      <div key={category} style={{ padding:"10px 12px", borderRadius:10, background:"#150A2E", border:"1px solid #2E1A52" }}>
                        <div style={{ display:"flex", gap:8, alignItems:"baseline", flexWrap:"wrap" }}>
                          <span style={{ color:"#FF7280", font:"700 14px 'Inter'" }}>{category}</span>
                          <span style={{ color:"#6B5A8E", font:"600 12px 'Inter'" }}>{total} rejected</span>
                        </div>
                        {examples.length > 0 && (
                          <div style={{ marginTop:4, color:"#8D7AAE", font:"400 12px 'Inter'", lineHeight:1.5 }}>
                            {examples.map((reason, i) => <div key={i}>&bull; {reason}</div>)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <details>
              <summary style={{ cursor:"pointer", color:"#fff", font:"700 17px 'Inter'", padding:"8px 0" }}>Accepted questions ({acceptedReport.length})</summary>
              <ol style={{ margin:"8px 0 0", paddingLeft:24, color:"#D9CCF2", font:"500 15px 'Inter'", lineHeight:1.6 }}>
                {acceptedReport.map(entry => <li key={entry.id}>{entry.questionText}</li>)}
              </ol>
            </details>
          </section>
        )}

        {questions.length > 0 && (
          <>
            <div style={{ font:"400 12px 'Inter'", color:"#6B5A8E", textAlign:"center", marginBottom:12 }}>Drag to reorder · {questions.length} questions</div>
            {questions.map((q, i) => (
              <div key={q._uid ?? i} draggable onDragStart={() => onDragStart(i)} onDragOver={e => onDragOver(e, i)} onDragEnd={onDragEnd}
                className="fbh-panel" style={{ cursor:"grab", userSelect:"none" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, flexWrap:"wrap" }}>
                  <span style={{ color:"#6B5A8E", font:"700 13px 'Inter'", minWidth:24 }}>{i+1}.</span>
                  <span className="fbh-chip">{typeLabel[q.question_type]||q.question_type}</span>
                  <span style={{ font:"400 11px 'Inter'", color:"#6B5A8E" }}>{q.difficulty}</span>
                  <div style={{ flex:1 }} />
                  <HostButton draggable={false} onDragStart={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); removeQuestion(i); }} onMouseDown={(e) => e.stopPropagation()} style={{ height:30, padding:"0 12px" }}>Remove</HostButton>
                </div>
                <p style={{ font:"700 18px 'Inter'", marginBottom:12, lineHeight:1.5, color:"#fff" }}>{q.question_text}</p>
                {q.question_type==="multiple_choice" && (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:8 }}>
                    {(["a","b","c","d"] as const).map(l => (
                      <div key={l} style={{ font:"600 15px 'Inter'", padding:"8px 12px", borderRadius:8, background:l===q.correct_answer?"rgba(46,224,110,0.15)":"#150A2E", color:l===q.correct_answer?"#2EE06E":"#B9A8D9", border:"1px solid "+(l===q.correct_answer?"rgba(46,224,110,0.4)":"#2E1A52") }}>
                        <span style={{ color:"#BE26C1", fontWeight:700, marginRight:6 }}>{l.toUpperCase()}.</span>{q[("option_"+l) as keyof Question] as string}
                      </div>
                    ))}
                  </div>
                )}
                {q.question_type==="multi_tap" && (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:6 }}>
                    {["a","b","c","d","e","f"].map(l => {
                      const optKey = "option_"+l as keyof Question;
                      const optText = q[optKey] as string | null;
                      if (!optText) return null;
                      const isCorrect = (q.correct_answer||"").split(",").map(s=>s.trim().toLowerCase()).includes(l);
                      return (
                        <div key={l} style={{ font:"600 14px 'Inter'", padding:"8px 12px", borderRadius:8, background:isCorrect?"rgba(46,224,110,0.15)":"#150A2E", color:isCorrect?"#2EE06E":"#B9A8D9", border:"1px solid "+(isCorrect?"rgba(46,224,110,0.4)":"#2E1A52") }}>
                          <span style={{ color:"#BE26C1", fontWeight:700, marginRight:6 }}>{l.toUpperCase()}.</span>{optText}
                        </div>
                      );
                    })}
                  </div>
                )}
                {q.question_type==="sequence" && (
                  <div style={{ marginBottom:8 }}>
                    {[q.option_a,q.option_b,q.option_c,q.option_d].filter(Boolean).map((item,idx) => (
                      <div key={idx} style={{ font:"600 15px 'Inter'", padding:"8px 12px", marginBottom:4, borderRadius:8, background:"#150A2E", color:"#B9A8D9", display:"flex", alignItems:"center", gap:8, border:"1px solid #2E1A52" }}>
                        <span style={{ color:"#BE26C1", fontWeight:700, minWidth:20 }}>{idx+1}.</span>{item}
                      </div>
                    ))}
                  </div>
                )}
                {(q.question_type==="text_answer"||q.question_type==="number") && (
                  <div style={{ marginBottom:8 }}>
                    {q.option_a && <p style={{ font:"400 13px 'Inter'", color:"#6B5A8E", margin:"0 0 4px", fontStyle:"italic" }}>{q.option_a}</p>}
                    <p style={{ font:"700 16px 'Inter'", color:"#2EE06E", margin:0 }}>Answer: {q.correct_answer}</p>
                  </div>
                )}
                {q.question_type==="picture" && (
                  <div style={{ marginBottom:8 }}>
                    <ImageUploader
                      currentUrl={q.option_b || null}
                      onUploaded={(url) => setQuestions(prev => prev.map(qq => qq._uid === q._uid ? { ...qq, option_b: url } : qq))}
                    />
                    <a href={"https://www.google.com/search?tbm=isch&q="+encodeURIComponent(q.option_a||q.correct_answer)} target="_blank" rel="noopener noreferrer"
                      style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:14, background:"#150A2E", border:"1px solid #2E1A52", color:"#D94FDC", textDecoration:"none", font:"600 13px 'Inter'", marginTop:10 }}>
                      Search &ldquo;{q.option_a||q.correct_answer}&rdquo; on Google Images (internal reference — players never see this)
                    </a>
                    <p style={{ font:"700 16px 'Inter'", color:"#2EE06E", margin:"8px 0 0" }}>Answer: {q.correct_answer}</p>
                  </div>
                )}
                {q.question_type==="audio" && (
                  <div style={{ marginBottom:8 }}>
                    {(q.option_b && q.option_b.includes("blob.vercel-storage.com")) ? (
                      <audio controls src={q.option_b} style={{ width:"100%", height:32 }} />
                    ) : (
                      <div style={{ padding:"14px", borderRadius:12, background:"rgba(190,38,193,0.08)", border:"1px solid #2E1A52" }}>
                        <p style={{ margin:"0 0 10px", font:"400 13px 'Inter'", color:"#B9A8D9" }}>
                          No clip attached yet. Save this round, then open <strong style={{ color:"#fff" }}>Music Prep</strong> to search Deezer and trim the clip — no companion app required.
                        </p>
                        <a href="/host/music-prep" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:14, background:"#150A2E", border:"1px solid #2E1A52", color:"#D94FDC", textDecoration:"none", font:"600 13px 'Inter'" }}>
                          Open Music Prep →
                        </a>
                      </div>
                    )}
                    <a href={"https://www.deezer.com/search/"+encodeURIComponent(q.option_a||q.correct_answer)} target="_blank" rel="noopener noreferrer"
                      style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:14, background:"#150A2E", border:"1px solid #2E1A52", color:"#D94FDC", textDecoration:"none", font:"600 13px 'Inter'", marginTop:10 }}>
                      Search &ldquo;{q.option_a||q.correct_answer}&rdquo; on Deezer (internal reference — players never see this)
                    </a>
                    <p style={{ font:"700 16px 'Inter'", color:"#2EE06E", margin:"8px 0 0" }}>Answer: {q.correct_answer}</p>
                  </div>
                )}
                {q.explanation && (
                  <div style={{ marginTop:10, padding:"10px 14px", borderRadius:8, background:"rgba(190,38,193,0.12)", borderLeft:"3px solid rgba(190,38,193,0.5)" }}>
                    <p style={{ font:"400 14px 'Inter'", color:"#D94FDC", margin:0, lineHeight:1.5 }}>{q.explanation}</p>
                  </div>
                )}
              </div>
            ))}

            <div className="fbh-panel">
              {questions.length < count && (
                <HostButton onClick={topUp} style={{ width:"100%", marginBottom:12 }}>
                  Top Up to {count} Questions ({count - questions.length} needed)
                </HostButton>
              )}
              <div className="fbh-lbl">Round Name</div>
              <HostInput value={roundName} onChange={e => setRoundName(e.target.value)} placeholder="e.g. Round 1 - General Knowledge - 14 June" style={{ marginBottom:12 }} />
              <HostButton variant="pri" big onClick={saveRound} disabled={saving||!roundName.trim()} style={{ width:"100%" }}>
                {saving ? "SAVING…" : "SAVE ROUND TO LIBRARY"}
              </HostButton>
            </div>
          </>
        )}
      </div>
    </HostShell>
  );
}
