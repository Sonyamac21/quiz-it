"use client";
import { useState, useRef, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ImageUploader } from "@/components/ImageUploader";
import { AudioUploader } from "@/components/AudioUploader";
import { AudioRecorder } from "@/components/AudioRecorder";
import { PURSUIT_TOTAL_QUESTIONS } from "@/lib/quiz/pursuit";
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

const TOPICS = ["music","movies","TV shows","sport","football","food and drink","celebrities","geography","famous landmarks","logos and brands","travel","social media and internet","simple history","famous people","animals","classic cartoons","video games","awards and records","fashion and style","comedy and humour","reality TV","theatre and musicals","UK culture","US culture","international culture","childhood and nostalgia","royals and politics","crime and mystery","cars and transport","nature and wildlife"];

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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roundName, setRoundName] = useState("");
  const usedRef = useRef<string[]>([]);
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
  const lastApiErrorRef = useRef<string>("");
  const dragIdx = useRef<number|null>(null);

  // Record a produced-but-rejected question so it is never regenerated/accepted
  // again this session.
  function blacklistRejected(q: Question) {
    const norm = normalizeQuestionText(q.question_text);
    if (norm) rejectedRef.current.add(norm);
  }

  useEffect(() => { loadUsedQuestions(); }, []);

  async function loadUsedQuestions() {
    const supabase = createSupabaseBrowserClient();
    const [{ data: rounds }, { data: bank }] = await Promise.all([
      supabase.from("rounds").select("questions"),
      supabase.from("question_bank").select("question_text"),
    ]);
    const used: string[] = [];
    if (rounds) rounds.forEach((r: {questions: {question_text:string}[]}) => r.questions?.forEach((q) => used.push(q.question_text)));
    if (bank) bank.forEach((q: {question_text:string}) => used.push(q.question_text));
    usedRef.current = used;
  }

  async function callAPI(prompt: string, maxTokens: number = 8000) {
    const res = await fetch("/api/generate-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, maxTokens }),
    });
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
    const text = data.content.filter((b:{type:string}) => b.type==="text").map((b:{text:string}) => b.text).join("");
    return text.replace(/```json/g,"").replace(/```/g,"").trim();
  }

  async function checkQuestion(q: Question): Promise<{ok: boolean; note: string}> {
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
    const allText = [q.question_text, ...optionTexts, answerForCheck].filter(Boolean).join(" ");
    const prompt = "You are a content moderator for a quiz night in Dubai, UAE. Check this question is safe for a mixed international audience. Reject if it contains: sexual references, crude body parts, alcohol, pork, drugs, religion, LGBTQ+ topics or references, references to Iran or Israel, or anything offensive. Also verify the answer is factually correct. Reply ONLY with JSON {\"ok\":true,\"note\":\"OK\"} or {\"ok\":false,\"note\":\"reason\"}. Content: " + allText;
    try {
      const text = await callAPI(prompt, 300);
      return JSON.parse(text);
    } catch {
      return { ok: false, note: "Could not verify" };
    }
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
      const text = await callAPI(prompt, 300);
      return JSON.parse(text);
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
      const text = await callAPI(prompt, 300);
      return JSON.parse(text);
    } catch {
      // Fail open - never let a verification hiccup stall generation.
      return { ok: true, note: "quality-check-unavailable" };
    }
  }

  async function generateOne(type: string, topic: string): Promise<Question|null> {
    // (lastApiError set inside try/catch below, surfaced by callers)
    const typeInstructions: Record<string,string> = {
      multi_tap: "multi_tap: exactly 6 options in option_a through option_f. Some are correct answers, some are decoys (wrong). Mix the count - between 2 and 4 of the 6 should be correct. correct_answer must be a comma-separated list of the correct option letters in order, e.g. \"b,d,f\" or \"a,c\". Make decoys plausible, not obviously wrong.",
      multiple_choice: "multiple_choice: 4 options A/B/C/D, correct_answer is a, b, c, or d",
      text_answer: "text_answer: the correct_answer MUST be a SINGLE word - no spaces, no commas, no \"and\", no \"&\", no \"/\", no multiple names, no multiple items, no hyphen-joined names. If the natural answer would be more than one word, choose a different question whose answer is a single word. All options must be null.",
      number: "number: numeric answer, options null except option_a which has a helpful hint e.g. \"To the nearest 10\"",
      sequence: "sequence: 4 items that have a definite correct chronological/logical order, written into option_a/b/c/d in that correct order. correct_answer must be exactly \"a,b,c,d\" (the order will be randomized programmatically afterward, so always write them in true correct order here).",
      picture: "picture: this generates a PICTURE ROUND question. There are two SEPARATE pieces of information you must produce - do not mix them: (1) option_a is an internal media search query, NEVER shown to players, used only to fetch a stock photo - a short, generic Google Images search query (3-5 words), e.g. \"Eiffel Tower Paris\" or \"red panda animal\" or \"Italian flag\". The subject MUST be one of: a famous landmark or building, an animal or species, a national flag, a well-known food or dish, or a sports venue/stadium. Do NOT use company/brand logos, famous people, movie stills, album covers, TV characters, or any copyrighted artwork or photography - these will not be found on stock photo sites (Pixabay specifically does not carry trademarked logos, so brand questions always return an unrelated photo). (2) question_text is the actual question shown to players underneath the image - it must be a short, generic question ABOUT the image itself, e.g. \"Name this landmark\", \"Which country is this flag from?\", \"What animal is this?\", \"Which city is this stadium in?\". question_text must NEVER contain the words \"Show teams this image\", must NEVER name or describe the actual subject (that would give away the answer), and must NEVER be an unrelated trivia question - it must always be directly answerable by looking at the image. option_b/c/d must be null. correct_answer is the specific answer to question_text (the landmark name, the country, the animal, etc).",
      audio: "audio: this generates a MUSIC ROUND question. There are two SEPARATE pieces of information you must produce - do not mix them: (1) option_a is an internal media search query, NEVER shown to players, used only to help find/reference the source track - a YouTube search query, e.g. \"Bohemian Rhapsody Queen official\". (2) question_text is the actual question shown to players after the clip plays - it must be a short, generic question ABOUT the song, e.g. \"Name this song\", \"Which artist performs this song?\", \"What year was this song released?\", \"Finish the lyric: ...\". question_text must NEVER state the song title or artist directly (that would give away the answer) and must NEVER be unrelated trivia - it must always be something a listener could only answer by having heard the clip. option_b/c/d must be null. correct_answer is the specific answer to question_text (the song title, the artist name, the year, etc - matching whatever question_text actually asks).",
    };
    // Cap to last 40 entries AND hard-truncate the assembled text - 150 entries
    // was overflowing the 8000-char prompt limit after enough generation history
    // built up, causing every generation to fail outright with "Prompt too long".
    // Questions rejected during THIS session are listed first so they survive the
    // truncation cap - the AI must be told not to reproduce them (the blacklist in
    // isAcceptable is the hard guard; this just stops wasted retries).
    const rejectedList = Array.from(rejectedRef.current);
    let exclusions = [...rejectedList, ...usedRef.current.slice(-40)].map((q,i) => (i+1)+". "+q).join("; ");
    if (exclusions.length > 3000) exclusions = exclusions.slice(0, 3000);
    const usedAnswersList = usedAnswersRef.current.slice(-30).filter(Boolean).join(", ");
    const exclusionNote = (exclusions || usedAnswersList)
      ? " Do NOT generate any of these already-used questions: " + exclusions + "."
        + (usedAnswersList ? " Also do NOT use any of these already-used answers (even with different question wording): " + usedAnswersList + "." : "")
      : "";
    const angle = VARIETY_ANGLES[Math.floor(Math.random() * VARIETY_ANGLES.length)];
    const varietyNote = " IMPORTANT - avoid defaulting to the single most famous, first-thought-of example for this topic (e.g. for 'Disney songs' don't always pick Let It Go or Circle of Life). Where possible, lean toward something " + angle + ". Vary your answer choices across different eras, genres, and sub-topics rather than the most obvious pick.";
    const prompt = `You are writing questions for a LIVE PUB QUIZ at a bar or restaurant. Your audience is adults aged 25-55 having a social night out. This is entertainment, not education.

BEFORE writing any question, ask yourself: "Would 8 friends sitting in a pub enjoy answering this?" If no, do not write it.

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
${varietyNote}${exclusionNote}

Include a 1-2 sentence explanation of the answer in the explanation field.
Return ONLY a valid JSON array with 1 item, no markdown:
[{"question_text":"...","question_type":"${type}","option_a":"...","option_b":"...","option_c":"...","option_d":"...","option_e":"...","option_f":"...","correct_answer":"...","explanation":"...","difficulty":"${difficulty}","round_type":"${roundType}"}]`;
    try {
      const text = await callAPI(prompt);
      let q;
      try {
        q = JSON.parse(text)[0];
      } catch {
        // TEMPORARY DIAGNOSTIC - surface the actual raw text that failed to parse
        // so we can see exactly what Claude returned instead of guessing blind.
        throw new Error("JSON parse failed. Raw text (first 500 chars): " + text.slice(0, 500));
      }
      if (q) { q.question_type = type; }
      // THEME RELEVANCE: if the host supplied a theme, every question (of ANY
      // type) must genuinely require knowledge of that theme. Checked here -
      // before any media fetch - so an off-theme candidate is rejected and
      // regenerated via the existing retry system without wasting an image/video
      // lookup. When no theme is supplied, behaviour is unchanged.
      if (q && theme && theme.trim()) {
        const themeCheck = await checkThemeRelevance(q, theme.trim());
        if (!themeCheck.ok) {
          lastApiErrorRef.current = "Off-theme for '" + theme.trim() + "' (" + themeCheck.note + ") - retrying";
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
          if (videoId) { q.option_b = "https://www.youtube.com/watch?v=" + videoId; } else { return null; }
        } catch { return null; }
      }
      if (q && q.question_type === "picture" && q.option_a) {
        // Hard guard, not just a prompt instruction - the AI can still ignore the
        // "no brand logos" instruction occasionally, and Pixabay structurally
        // cannot return trademarked logo images, so any question that slips
        // through gets rejected here and retried as a different question rather
        // than shipped with a guaranteed-wrong image.
        const brandCheck = (q.question_text + " " + q.option_a).toLowerCase();
        if (/\blogo\b|\bbrand\b|\btrademark\b/.test(brandCheck)) {
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
          if (hit) { q.option_b = hit.webformatURL || hit.largeImageURL; } else { return null; }
        } catch { return null; }
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
          lastApiErrorRef.current = "Multi Tap answer key invalid ('" + (q.correct_answer || "") + "') - retrying";
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
          lastApiErrorRef.current = "Text Answer must be a single word (got '" + ans + "') - retrying";
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
      lastApiErrorRef.current = e instanceof Error ? e.message : "Unknown error";
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

    const normText = normalizeQuestionText(q.question_text);
    const normAnswer = (q.correct_answer || "").toLowerCase().trim();

    // a0) Blacklisted earlier this session - never allow the exact same question back.
    if (rejectedRef.current.has(normText)) return "blacklist";

    // a) Exact text duplicate - verbatim match against this round or history.
    if (usedRef.current.some(t => normalizeQuestionText(t) === normText)) return "exact-text:used-or-history";
    if (currentRound.some(g => normalizeQuestionText(g.question_text) === normText)) return "exact-text:current-round";

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

  function isAcceptable(q: Question, currentRound: Question[]): boolean {
    return duplicateRejectionReason(q, currentRound) === null;
  }

  // ── Permanent Question Memory (cross-session, DB-backed) ───────────────────
  // The authoritative store is the public.questions table; the check runs
  // server-side in Postgres (check_question_memory RPC) so it persists across
  // all sessions/dates and never relies on browser/React state. Returns true if
  // an identical or substantially-similar question already exists in memory.
  // Fails OPEN (returns false) if the RPC/migration isn't available yet, so
  // generation is never hard-blocked by a missing memory backend.
  async function isDuplicateInMemory(q: Question): Promise<boolean> {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("check_question_memory", {
        p_text: q.question_text,
        p_type: q.question_type,
        p_threshold: 0.6,
      });
      if (error) { console.error("Question Memory check unavailable (allowing question):", error.message); return false; }
      return data != null; // a matching id means a same/similar question already exists
    } catch (e) {
      console.error("Question Memory check error (allowing question):", e);
      return false;
    }
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
    setRoundName("");
    // Fresh generation session: start the rejected-question blacklist empty so it
    // only reflects questions rejected during this run (it then persists across
    // every retry, top-up and replace until the next Generate).
    rejectedRef.current = new Set();
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
    } else {
      const mcCount = Math.round(count * 0.25);
      const taCount = Math.round(count * 0.20);
      const numCount = Math.round(count * 0.15);
      const seqCount = Math.round(count * 0.10);
      const picCount = Math.round(count * 0.20);
      const audCount = count - mcCount - taCount - numCount - seqCount - picCount;
      types = shuffle([
        ...Array(mcCount).fill("multiple_choice"),
        ...Array(taCount).fill("text_answer"),
        ...Array(numCount).fill("number"),
        ...Array(seqCount).fill("sequence"),
        ...Array(Math.max(0,picCount)).fill("picture"),
        ...Array(Math.max(0,audCount)).fill("audio"),
      ]);
    }
    const shuffledTopics = shuffle(TOPICS);
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
    const maxAttempts = count * 6;
    let i = 0;
    let consecutiveFailures = 0;
    let consecutiveCheckFailures = 0;
    while (good.length < count && attempts < maxAttempts) {
      const type = types[i % types.length];
      const topic = theme || shuffledTopics[(i + good.length) % shuffledTopics.length];
      setStatus("Generating question " + (good.length + 1) + " of " + count + "..." + (consecutiveFailures > 0 ? " (retry " + consecutiveFailures + ")" : ""));
      attempts++;
      lastApiErrorRef.current = "";
      const q = await generateOne(type, topic);
      if (!q) {
        consecutiveFailures++;
        // Bail for errors retrying genuinely can't fix (bad key, not logged in,
        // rate limited) - OR after 6 failures in a row regardless of the reason,
        // since that many consecutive failures means something systemic is wrong,
        // not just a one-off blip, and silently grinding through 60+ attempts
        // with zero visible feedback just looks frozen.
        const err = lastApiErrorRef.current.toLowerCase();
        const isPersistent = err.includes("api_key") || err.includes("api key") || err.includes("unauthorized")
          || err.includes("not logged in") || err.includes("authentication") || err.includes("rate limit")
          || err.includes("too many requests") || consecutiveFailures >= 6;
        if (isPersistent) {
          setStatus("Generation failed after " + consecutiveFailures + " attempts: " + (lastApiErrorRef.current || "unknown error"));
          setLoading(false);
          return;
        }
        i++; continue;
      }
      consecutiveFailures = 0;
      setStatus("Checking question " + (good.length + 1) + " of " + count + "...");
      const check = await checkQuestion(q);
      // Gate order: moderation -> in-round duplicate detection -> permanent
      // Question Memory (cross-session) -> FINAL quiz quality check. Each stage is
      // short-circuited so the expensive AI checks only run once the cheaper ones
      // pass; the final quality judge is the very last gate before acceptance.
      if (check.ok && isAcceptable(q, good) && !(await isDuplicateInMemory(q)) && (await finalQualityCheck(q)).ok) {
        await commitToMemory(q); // accepted -> becomes part of permanent memory
        good.push(q);
        registerAccepted(q);
        // Append functionally to the LIVE list instead of replacing it with a
        // snapshot of `good`. A full `setQuestions([...good])` here would resurrect
        // any question the user removed (via removeAndReplace) while this loop was
        // still running, because `good` has no knowledge of that removal. Appending
        // by prev keeps concurrent removals intact.
        setQuestions(prev => prev.some(x => x._uid === q._uid) ? prev : [...prev, q]);
        consecutiveCheckFailures = 0;
      } else {
        // Permanently blacklist this exact question for the rest of the session
        // so the retry can never reproduce it (and the AI is told to avoid it).
        blacklistRejected(q);
        consecutiveCheckFailures++;
        const failReason = !check.ok ? check.note.substring(0,40) : "duplicate/quality";
        setStatus("Question " + (good.length + 1) + " failed check (" + failReason + ") - retrying...");
        // Same logic as generateOne failures above - if questions keep failing the
        // safety/duplicate check over and over, that's systemic (e.g. exclusion
        // list too aggressive, or the moderator prompt rejecting too much), not a
        // one-off blip. Bailing with a clear message beats silently grinding
        // through dozens of slow retries that look identical to "frozen".
        if (consecutiveCheckFailures >= 10) {
          setStatus("Generation stalled after " + consecutiveCheckFailures + " questions in a row failing the check (latest reason: " + check.note.substring(0,60) + "). Got " + good.length + " of " + count + " - click Top Up to keep trying, or Generate again.");
          setLoading(false);
          return;
        }
      }
      i++;
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

    // Keep requesting genuinely new questions through every rejection reason
    // (AI produced nothing/invalid, moderation reject, duplicate reject) until we
    // get a valid one or hit the retry ceiling.
    for (let attempt = 0; attempt < MAX_REPLACE_ATTEMPTS && !newQ; attempt++) {
      setStatus("Finding replacement... (attempt " + (attempt + 1) + " of " + MAX_REPLACE_ATTEMPTS + ")");
      const replaceTopic = theme || topicList[attempt % topicList.length];
      const candidate = await generateOne(removed.question_type, replaceTopic);
      if (!candidate) continue; // AI produced nothing/invalid - try again
      const check = await checkQuestion(candidate);
      if (!check.ok) { blacklistRejected(candidate); continue; } // moderation reject
      // Compare against every OTHER question currently in the round (excluding the
      // one being replaced) so the replacement isn't rejected for matching the
      // very item it is swapping out.
      const currentRound = questions.filter(x => x._uid !== removedUid);
      if (isAcceptable(candidate, currentRound) && !(await isDuplicateInMemory(candidate)) && (await finalQualityCheck(candidate)).ok) {
        newQ = candidate;
      } else {
        blacklistRejected(candidate); // in-round/memory duplicate or final-quality reject - keep trying
      }
    }

    if (!newQ) {
      // Every attempt failed: leave the ORIGINAL question exactly where it is so
      // the round keeps its full count, and report a proper error.
      setStatus("Couldn't generate a replacement after " + MAX_REPLACE_ATTEMPTS + " tries - the original question is kept. Try Remove again."
        + (lastApiErrorRef.current ? " (last error: " + lastApiErrorRef.current + ")" : ""));
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
    // types instead of the correct format for that round.
    const types =
      roundType === "music" ? ["audio"] :
      roundType === "multi_tap" ? ["multi_tap"] :
      ["multiple_choice","text_answer","number","sequence"];
    const topicList = shuffle(TOPICS);
    const added: Question[] = [];
    let attempts = 0;
    while (added.length < needed && attempts < needed * 6) {
      attempts++;
      const type = types[attempts % types.length];
      const topic = topicList[attempts % topicList.length];
      const q = await generateOne(type, topic);
      if (!q) continue;
      const check = await checkQuestion(q);
      const currentForTopup = [...questions, ...added];
      if (check.ok && isAcceptable(q, currentForTopup) && !(await isDuplicateInMemory(q)) && (await finalQualityCheck(q)).ok) {
        await commitToMemory(q); // accepted -> becomes part of permanent memory
        registerAccepted(q);
        added.push(q);
        setQuestions(prev => [...prev, q]);
      } else {
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

  return (
    <HostShell>
      <div style={{ minHeight:"100vh", background:STAGE_BG, color:"#fff", padding:"24px", maxWidth:980, margin:"0 auto" }}>
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
                  <HostButton onClick={(e) => { e.stopPropagation(); removeAndReplace(i); }} onMouseDown={(e) => e.stopPropagation()} style={{ height:30, padding:"0 12px" }}>Remove</HostButton>
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
                    <AudioRecorder
                      songReference={q.option_a || null}
                      currentUrl={(q.option_b && q.option_b.includes("blob.vercel-storage.com")) ? q.option_b : null}
                      onUploaded={(url, fileMeta, clipMeta) => {
                        setQuestions(prev => prev.map(qq => qq._uid === q._uid ? { ...qq, option_b: url || null } : qq));
                      }}
                    />
                    <a href={"https://www.youtube.com/results?search_query="+encodeURIComponent(q.option_a||q.correct_answer)} target="_blank" rel="noopener noreferrer"
                      style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:14, background:"#150A2E", border:"1px solid #2E1A52", color:"#D94FDC", textDecoration:"none", font:"600 13px 'Inter'", marginTop:10 }}>
                      Search &ldquo;{q.option_a||q.correct_answer}&rdquo; on YouTube (internal reference — players never see this)
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
