"use client";
import { useState, useRef, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ImageUploader } from "@/components/ImageUploader";
import { AudioUploader } from "@/components/AudioUploader";
import { AudioRecorder } from "@/components/AudioRecorder";

type Question = {
  id?: number;
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
const typeBg: Record<string,string> = { multi_tap:"#002a1a", multiple_choice:"#1e1040", text_answer:"#0f2a1a", number:"#2a1a00", sequence:"#1a002a", picture:"#0a1a2a", audio:"#1a0a00" };
const typeColor: Record<string,string> = { multi_tap:"#4ade80", multiple_choice:"#a78bfa", text_answer:"#34d399", number:"#fbbf24", sequence:"#f472b6", picture:"#38bdf8", audio:"#fb923c" };
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

export default function QuestionsPage() {
  const [roundType, setRoundType] = useState("regular");
  const [difficulty, setDifficulty] = useState("mixed");
  const [theme, setTheme] = useState("");
  const [count, setCount] = useState(15);
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
  const lastApiErrorRef = useRef<string>("");
  const dragIdx = useRef<number|null>(null);

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
    const allText = [q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer].filter(Boolean).join(" ");
    const prompt = "You are a content moderator for a quiz night in Dubai, UAE. Check this question is safe for a mixed international audience. Reject if it contains: sexual references, crude body parts, alcohol, pork, drugs, religion, LGBTQ+ topics or references, references to Iran or Israel, or anything offensive. Also verify the answer is factually correct. Reply ONLY with JSON {\"ok\":true,\"note\":\"OK\"} or {\"ok\":false,\"note\":\"reason\"}. Content: " + allText;
    try {
      const text = await callAPI(prompt, 300);
      return JSON.parse(text);
    } catch {
      return { ok: false, note: "Could not verify" };
    }
  }

  async function generateOne(type: string, topic: string): Promise<Question|null> {
    // (lastApiError set inside try/catch below, surfaced by callers)
    const typeInstructions: Record<string,string> = {
      multi_tap: "multi_tap: exactly 6 options in option_a through option_f. Some are correct answers, some are decoys (wrong). Mix the count - between 2 and 4 of the 6 should be correct. correct_answer must be a comma-separated list of the correct option letters in order, e.g. \"b,d,f\" or \"a,c\". Make decoys plausible, not obviously wrong.",
      multiple_choice: "multiple_choice: 4 options A/B/C/D, correct_answer is a, b, c, or d",
      text_answer: "text_answer: short word or phrase answer, all options must be null",
      number: "number: numeric answer, options null except option_a which has a helpful hint e.g. \"To the nearest 10\"",
      sequence: "sequence: 4 items that have a definite correct chronological/logical order, written into option_a/b/c/d in that correct order. correct_answer must be exactly \"a,b,c,d\" (the order will be randomized programmatically afterward, so always write them in true correct order here).",
      picture: "picture: this generates a PICTURE ROUND question. There are two SEPARATE pieces of information you must produce - do not mix them: (1) option_a is an internal media search query, NEVER shown to players, used only to fetch a stock photo - a short, generic Google Images search query (3-5 words), e.g. \"Eiffel Tower Paris\" or \"red panda animal\" or \"Italian flag\". The subject MUST be one of: a famous landmark or building, an animal or species, a national flag, a well-known food or dish, or a sports venue/stadium. Do NOT use company/brand logos, famous people, movie stills, album covers, TV characters, or any copyrighted artwork or photography - these will not be found on stock photo sites (Pixabay specifically does not carry trademarked logos, so brand questions always return an unrelated photo). (2) question_text is the actual question shown to players underneath the image - it must be a short, generic question ABOUT the image itself, e.g. \"Name this landmark\", \"Which country is this flag from?\", \"What animal is this?\", \"Which city is this stadium in?\". question_text must NEVER contain the words \"Show teams this image\", must NEVER name or describe the actual subject (that would give away the answer), and must NEVER be an unrelated trivia question - it must always be directly answerable by looking at the image. option_b/c/d must be null. correct_answer is the specific answer to question_text (the landmark name, the country, the animal, etc).",
      audio: "audio: this generates a MUSIC ROUND question. There are two SEPARATE pieces of information you must produce - do not mix them: (1) option_a is an internal media search query, NEVER shown to players, used only to help find/reference the source track - a YouTube search query, e.g. \"Bohemian Rhapsody Queen official\". (2) question_text is the actual question shown to players after the clip plays - it must be a short, generic question ABOUT the song, e.g. \"Name this song\", \"Which artist performs this song?\", \"What year was this song released?\", \"Finish the lyric: ...\". question_text must NEVER state the song title or artist directly (that would give away the answer) and must NEVER be unrelated trivia - it must always be something a listener could only answer by having heard the clip. option_b/c/d must be null. correct_answer is the specific answer to question_text (the song title, the artist name, the year, etc - matching whatever question_text actually asks).",
    };
    console.log("usedRef has", usedRef.current.length, "entries");
    // Cap to last 40 entries AND hard-truncate the assembled text - 150 entries
    // was overflowing the 8000-char prompt limit after enough generation history
    // built up, causing every generation to fail outright with "Prompt too long".
    let exclusions = usedRef.current.slice(-40).map((q,i) => (i+1)+". "+q).join("; ");
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
      }
      // Save into the master question library so it persists independently of
      // whatever round it ends up in - this is the foundation repeat-prevention
      // is built on. If an identical question (same text+type) already exists,
      // the unique index means this is a no-op and we just attach the existing id.
      try {
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
        const { data: libData } = await createSupabaseBrowserClient()
          .from("questions")
          .upsert(libRow, { onConflict: "question_text,question_type", ignoreDuplicates: true })
          .select("id")
          .maybeSingle();
        if (libData?.id) {
          q.id = libData.id;
        } else {
          // Row already existed (ignoreDuplicates skipped the insert) - look up its id.
          const { data: existing } = await createSupabaseBrowserClient()
            .from("questions")
            .select("id")
            .ilike("question_text", q.question_text)
            .eq("question_type", q.question_type)
            .maybeSingle();
          if (existing?.id) q.id = existing.id;
        }
      } catch (libErr) {
        // Never let library bookkeeping block actual question generation -
        // worst case a question is missing its id and just won't be tracked
        // for repeat-prevention purposes this one time.
        console.error("Failed to save question to library:", libErr);
      }
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
  function isAcceptable(q: Question, currentRound: Question[]): boolean {
    const STOP = new Set(["what","which","where","when","who","that","this","with","from","have","been","were","they","their","about","only","does","into","than","other","more","over","some","also","after","before","known","its","the","and","for","are","but","not","you","all","can","had","her","him","his","how","man","new","now","old","see","two","way","who","boy","did","its","let","put","say","she","too","use","was"]);
    const sigWords = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 3 && !STOP.has(w));

    const normText = q.question_text.toLowerCase().trim();
    const normAnswer = (q.correct_answer || "").toLowerCase().trim();

    // a) Exact text match - already in this round or historical session
    if (usedRef.current.some(t => t.toLowerCase().trim() === normText)) return false;
    if (currentRound.some(g => g.question_text.toLowerCase().trim() === normText)) return false;

    // b) Same answer already in this round (catches "Bat" / "Bat" pattern)
    if (normAnswer && currentRound.some(g =>
      g.question_type === q.question_type &&
      (g.correct_answer || "").toLowerCase().trim() === normAnswer
    )) return false;
    if (normAnswer && usedAnswersRef.current.includes(normAnswer)) return false;

    // c) Semantic similarity - ≥55% significant-word overlap with any round question
    const newWords = sigWords(q.question_text);
    if (newWords.length > 0) {
      for (const g of currentRound) {
        const existWords = sigWords(g.question_text);
        if (existWords.length === 0) continue;
        const shared = newWords.filter(w => existWords.includes(w)).length;
        const overlap = shared / Math.min(newWords.length, existWords.length);
        if (overlap >= 0.55) return false;
      }
    }
    return true;
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
    let types: string[];
    if (roundType === "music") {
      types = Array(count).fill("audio");
    } else if (roundType === "multi_tap") {
      types = Array(count).fill("multi_tap");
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
      if (check.ok && isAcceptable(q, good)) {
        good.push(q);
        registerAccepted(q);
        setQuestions([...good]);
        consecutiveCheckFailures = 0;
      } else {
        consecutiveCheckFailures++;
        setStatus("Question " + (good.length + 1) + " failed check (" + check.note.substring(0,40) + ") - retrying...");
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

  async function removeAndReplace(i: number) {
    const removed = questions[i];
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.from("question_bank").insert({
        question_text: removed.question_text, question_type: removed.question_type,
        option_a: removed.option_a, option_b: removed.option_b,
        option_c: removed.option_c, option_d: removed.option_d,
        correct_answer: removed.correct_answer, difficulty: removed.difficulty,
        round_type: removed.round_type,
      });
    } catch(e) { console.log("Bank insert failed:", e); }
    registerAccepted(removed); // tracks both text and answer so replacement can't be same fact
    setQuestions(prev => prev.filter((_,idx) => idx !== i));
    setStatus("Finding replacement...");
    const topicList = shuffle(TOPICS);
    let replaced = false;
    for (let attempt = 0; attempt < 10 && !replaced; attempt++) {
      const replaceTopic = theme || topicList[attempt % topicList.length];
      const newQ = await generateOne(removed.question_type, replaceTopic);
      if (!newQ) continue;
      const check = await checkQuestion(newQ);
      const currentRound = questions.filter((_,idx) => idx !== i);
      if (check.ok && isAcceptable(newQ, currentRound)) {
        registerAccepted(newQ);
        setQuestions(prev => [...prev, newQ]);
        setStatus("Replaced!");
        setTimeout(() => setStatus(""), 2000);
        replaced = true;
      }
    }
    if (!replaced) setStatus(lastApiErrorRef.current ? "Generation failed: " + lastApiErrorRef.current : "Could not find replacement - try generating again.");
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
      if (check.ok && isAcceptable(q, currentForTopup)) {
        registerAccepted(q);
        added.push(q);
        setQuestions(prev => [...prev, q]);
      }
    }
    setStatus(added.length === needed ? "Ready! Drag to reorder, then name and save." : "Added " + added.length + " of " + needed + " needed.");
  }

  async function saveRound() {
    if (!roundName.trim()) { setStatus("Please enter a round name first!"); return; }
    if (questions.length === 0) { setStatus("No questions to save!"); return; }
    setSaving(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("rounds").insert({
      name: roundName.trim(), round_type: roundType, difficulty: difficulty, questions: questions,
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
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg, #1a0535 0%, #0d0225 100%)", color:"#fff", padding:"24px", maxWidth:"960px", margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
        <div style={{ width:44, height:44, borderRadius:"50%", background:"#1a0530", border:"2px solid #BE26C1", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#BE26C1", fontWeight:700 }}>ME</div>
        <div>
          <div style={{ fontSize:22, fontWeight:700, color:"#BE26C1", letterSpacing:4 }}>Question Generator</div>
          <div style={{ fontSize:11, color:"rgba(190,38,193,0.6)", letterSpacing:2 }}>Quiz-It · Powered by Mac Entertainment</div>
        </div>
        <div style={{ flex:1 }} />
        <a href="/host/rounds" style={{ padding:"8px 16px", borderRadius:10, border:"1px solid rgba(190,38,193,0.4)", background:"rgba(190,38,193,0.06)", color:"#BE26C1", textDecoration:"none", fontSize:12, fontWeight:600, letterSpacing:2, boxShadow:"0 2px 6px rgba(0,0,0,0.2)" }}>Round Library</a>
      </div>

      <div style={{ background:"linear-gradient(160deg, rgba(60,15,110,0.4), rgba(30,8,60,0.4))", border:"1px solid rgba(190,38,193,0.3)", borderRadius:16, padding:20, marginBottom:20, boxShadow:"inset 0 1px 1px rgba(255,255,255,0.05)" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <div>
            <label style={{ fontSize:11, letterSpacing:3, color:"rgba(190,38,193,0.6)", display:"block", marginBottom:6 }}>ROUND TYPE</label>
            <select value={roundType} onChange={e => setRoundType(e.target.value)} style={{ width:"100%", padding:"8px 12px", borderRadius:10, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.3)" }}>
              <option value="regular">Regular round</option>
              <option value="bonus">Bonus / themed</option>
              <option value="music">Music round</option>
              <option value="multi_tap">Multi Tap round</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize:11, letterSpacing:3, color:"rgba(190,38,193,0.6)", display:"block", marginBottom:6 }}>QUESTIONS</label>
            <select value={count} onChange={e => setCount(parseInt(e.target.value))} style={{ width:"100%", padding:"8px 12px", borderRadius:10, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.3)" }}>
              {[5,10,15].map(c => <option key={c} value={c}>{c} questions</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:11, letterSpacing:3, color:"rgba(190,38,193,0.6)", display:"block", marginBottom:6 }}>DIFFICULTY</label>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {["easy","medium","hard","mixed"].map(d => (
                <button key={d} onClick={() => setDifficulty(d)} style={{ padding:"6px 12px", borderRadius:999, border:"1px solid rgba(190,38,193,0.4)", background:difficulty===d?"#BE26C1":"transparent", color:"#fff", cursor:"pointer", fontSize:12, boxShadow:difficulty===d?"0 2px 6px rgba(0,0,0,0.25)":"none" }}>{d}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:11, letterSpacing:3, color:"rgba(190,38,193,0.6)", display:"block", marginBottom:6 }}>THEME / TOPIC (optional)</label>
          <input value={theme} onChange={e => setTheme(e.target.value)} placeholder="e.g. 90s movies, space... leave blank for random variety" style={{ width:"100%", padding:"10px 16px", borderRadius:10, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.3)", boxSizing:"border-box" }} />
        </div>
        <button onClick={() => setManualOpen(!manualOpen)} style={{ width:"100%", padding:10, borderRadius:10, background:"rgba(190,38,193,0.06)", border:"1px solid rgba(190,38,193,0.4)", color:"#BE26C1", fontSize:13, fontWeight:600, letterSpacing:2, cursor:"pointer", marginBottom:12 }}>
          {manualOpen ? "Hide Manual Question Entry" : "+ Add a Question Manually"}
        </button>

        {manualOpen && (
          <div style={{ background:"linear-gradient(160deg, rgba(45,10,90,0.5), rgba(20,5,45,0.5))", border:"1px solid rgba(190,38,193,0.3)", borderRadius:12, padding:16, marginBottom:16, display:"flex", flexDirection:"column" as const, gap:10, boxShadow:"inset 0 1px 1px rgba(255,255,255,0.04)" }}>
            <select value={manualType} onChange={e => setManualType(e.target.value)} style={{ padding:"8px 12px", borderRadius:10, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.3)" }}>
              <option value="multiple_choice">Multiple Choice</option>
              <option value="text_answer">Text Answer</option>
              <option value="number">Number</option>
              <option value="sequence">Sequence</option>
              <option value="multi_tap">Multi Tap</option>
            </select>
            <textarea value={manualText} onChange={e => setManualText(e.target.value)} placeholder="Question text..." rows={2} style={{ padding:"8px 12px", borderRadius:10, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.3)", fontFamily:"inherit" }} />
            {(manualType === "multiple_choice" || manualType === "sequence" || manualType === "multi_tap") && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <input value={manualA} onChange={e => setManualA(e.target.value)} placeholder="Option A" style={{ padding:"8px 12px", borderRadius:10, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.3)" }} />
                <input value={manualB} onChange={e => setManualB(e.target.value)} placeholder="Option B" style={{ padding:"8px 12px", borderRadius:10, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.3)" }} />
                <input value={manualC} onChange={e => setManualC(e.target.value)} placeholder="Option C" style={{ padding:"8px 12px", borderRadius:10, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.3)" }} />
                <input value={manualD} onChange={e => setManualD(e.target.value)} placeholder="Option D" style={{ padding:"8px 12px", borderRadius:10, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.3)" }} />
                {manualType === "multi_tap" && (
                  <>
                    <input value={manualE} onChange={e => setManualE(e.target.value)} placeholder="Option E" style={{ padding:"8px 12px", borderRadius:10, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.3)" }} />
                    <input value={manualF} onChange={e => setManualF(e.target.value)} placeholder="Option F" style={{ padding:"8px 12px", borderRadius:10, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.3)" }} />
                  </>
                )}
              </div>
            )}
            <input value={manualCorrect} onChange={e => setManualCorrect(e.target.value)}
              placeholder={manualType === "multiple_choice" ? "Correct answer letter, e.g. b" : manualType === "sequence" ? "Correct order, e.g. a,b,c,d" : manualType === "multi_tap" ? "Correct letters, e.g. b,d,f" : "Correct answer"}
              style={{ padding:"8px 12px", borderRadius:10, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.3)" }} />
            <input value={manualExplanation} onChange={e => setManualExplanation(e.target.value)} placeholder="Explanation (optional)" style={{ padding:"8px 12px", borderRadius:10, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.3)" }} />
            {manualError && <p style={{ color:"#FF5555", fontSize:13 }}>{manualError}</p>}
            <button onClick={addManualQuestion} style={{ padding:10, borderRadius:10, background:"rgba(190,38,193,0.25)", border:"1px solid #BE26C1", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,0.2)" }}>Add to List</button>
          </div>
        )}

        <button onClick={generate} disabled={loading} style={{ width:"100%", padding:14, borderRadius:10, background:loading?"#4a1060":"#BE26C1", color:"#fff", border:"none", fontSize:16, fontWeight:700, letterSpacing:4, cursor:loading?"not-allowed":"pointer", opacity:loading?0.7:1, boxShadow:loading?"none":"0 2px 12px rgba(190,38,193,0.35)" }}>
          {loading ? "Generating..." : "Generate Round"}
        </button>
      </div>

      {status && <p style={{ textAlign:"center", color:"rgba(190,38,193,0.8)", fontSize:13, letterSpacing:2, marginBottom:16 }}>{status}</p>}

      {questions.length > 0 && (
        <>
          <div style={{ fontSize:12, color:"#666", textAlign:"center", marginBottom:12 }}>Drag to reorder · {questions.length} questions</div>
          {questions.map((q, i) => (
            <div key={i} draggable onDragStart={() => onDragStart(i)} onDragOver={e => onDragOver(e, i)} onDragEnd={onDragEnd}
              style={{ background:"linear-gradient(160deg, rgba(60,15,110,0.35), rgba(30,8,60,0.35))", border:"1px solid rgba(190,38,193,0.3)", borderRadius:14, padding:18, marginBottom:12, cursor:"grab", userSelect:"none", boxShadow:"inset 0 1px 1px rgba(255,255,255,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, flexWrap:"wrap" }}>
                <span style={{ color:"#555", fontSize:13, fontWeight:700, minWidth:24 }}>{i+1}.</span>
                <span style={{ background:typeBg[q.question_type]||"#1a1a1a", color:typeColor[q.question_type]||"#aaa", padding:"3px 10px", borderRadius:999, fontSize:11, fontWeight:600 }}>
                  {typeLabel[q.question_type]||q.question_type}
                </span>
                <span style={{ fontSize:11, color:"#555" }}>{q.difficulty}</span>
                <div style={{ flex:1 }} />
                <button onClick={(e) => { e.stopPropagation(); removeAndReplace(i); }} onMouseDown={(e) => e.stopPropagation()} style={{ padding:"3px 10px", borderRadius:8, border:"1px solid #ef4444", background:"transparent", color:"#ef4444", cursor:"pointer", fontSize:11 }}>Remove</button>
              </div>
              <p style={{ fontSize:18, fontWeight:700, marginBottom:12, lineHeight:1.5, color:"#fff" }}>{q.question_text}</p>
              {q.question_type==="multiple_choice" && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:8 }}>
                  {(["a","b","c","d"] as const).map(l => (
                    <div key={l} style={{ fontSize:15, padding:"8px 12px", borderRadius:8, background:l===q.correct_answer?"rgba(34,197,94,0.18)":"#221a35", color:l===q.correct_answer?"#4ade80":"#ddd", border:"1px solid "+(l===q.correct_answer?"rgba(34,197,94,0.4)":"transparent"), boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}>
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
                      <div key={l} style={{ fontSize:14, padding:"8px 12px", borderRadius:8, background:isCorrect?"rgba(34,197,94,0.18)":"#221a35", color:isCorrect?"#4ade80":"#ddd", border:"1px solid "+(isCorrect?"rgba(34,197,94,0.4)":"transparent"), boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}>
                        <span style={{ color:"#BE26C1", fontWeight:700, marginRight:6 }}>{l.toUpperCase()}.</span>{optText}
                      </div>
                    );
                  })}
                </div>
              )}
              {q.question_type==="sequence" && (
                <div style={{ marginBottom:8 }}>
                  {[q.option_a,q.option_b,q.option_c,q.option_d].filter(Boolean).map((item,idx) => (
                    <div key={idx} style={{ fontSize:15, padding:"8px 12px", marginBottom:4, borderRadius:8, background:"#221a35", color:"#eee", display:"flex", alignItems:"center", gap:8, boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}>
                      <span style={{ color:"#BE26C1", fontWeight:700, minWidth:20 }}>{idx+1}.</span>{item}
                    </div>
                  ))}
                </div>
              )}
              {(q.question_type==="text_answer"||q.question_type==="number") && (
                <div style={{ marginBottom:8 }}>
                  {q.option_a && <p style={{ fontSize:13, color:"#999", margin:"0 0 4px", fontStyle:"italic" }}>{q.option_a}</p>}
                  <p style={{ fontSize:16, color:"#4ade80", fontWeight:700, margin:0 }}>Answer: {q.correct_answer}</p>
                </div>
              )}
              {q.question_type==="picture" && (
                <div style={{ marginBottom:8 }}>
                  <ImageUploader
                    currentUrl={q.option_b || null}
                    onUploaded={(url) => setQuestions(prev => prev.map((qq, idx) => idx === i ? { ...qq, option_b: url } : qq))}
                  />
                  <a href={"https://www.google.com/search?tbm=isch&q="+encodeURIComponent(q.option_a||q.correct_answer)} target="_blank" rel="noopener noreferrer"
                    style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:8, background:"rgba(56,189,248,0.15)", border:"1px solid rgba(56,189,248,0.4)", color:"#38bdf8", textDecoration:"none", fontSize:13, fontWeight:600, marginTop:10, boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}>
                    Search "{q.option_a||q.correct_answer}" on Google Images (internal reference - players never see this)
                  </a>
                  <p style={{ fontSize:16, color:"#4ade80", fontWeight:700, margin:"8px 0 0" }}>Answer: {q.correct_answer}</p>
                </div>
              )}
              {q.question_type==="audio" && (
                <div style={{ marginBottom:8 }}>
                  <AudioRecorder
                    songReference={q.option_a || null}
                    currentUrl={(q.option_b && q.option_b.includes("blob.vercel-storage.com")) ? q.option_b : null}
                    onUploaded={(url, fileMeta, clipMeta) => {
                      setQuestions(prev => prev.map((qq, idx) => idx === i ? { ...qq, option_b: url || null } : qq));
                    }}
                  />
                  <a href={"https://www.youtube.com/results?search_query="+encodeURIComponent(q.option_a||q.correct_answer)} target="_blank" rel="noopener noreferrer"
                    style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:8, background:"rgba(251,146,60,0.15)", border:"1px solid rgba(251,146,60,0.4)", color:"#fb923c", textDecoration:"none", fontSize:13, fontWeight:600, marginTop:10, boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}>
                    Search "{q.option_a||q.correct_answer}" on YouTube (internal reference - players never see this)
                  </a>
                  <p style={{ fontSize:16, color:"#4ade80", fontWeight:700, margin:"8px 0 0" }}>Answer: {q.correct_answer}</p>
                </div>
              )}
              {q.explanation && (
                <div style={{ marginTop:10, padding:"10px 14px", borderRadius:8, background:"rgba(190,38,193,0.12)", borderLeft:"3px solid rgba(190,38,193,0.5)", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}>
                  <p style={{ fontSize:14, color:"#e0b8e8", margin:0, lineHeight:1.5 }}>{q.explanation}</p>
                </div>
              )}
            </div>
          ))}

          <div style={{ background:"linear-gradient(160deg, rgba(60,15,110,0.4), rgba(30,8,60,0.4))", border:"1px solid rgba(190,38,193,0.3)", borderRadius:16, padding:20, marginTop:16, boxShadow:"inset 0 1px 1px rgba(255,255,255,0.05)" }}>
            {questions.length < count && (
              <button onClick={topUp} style={{ width:"100%", padding:10, borderRadius:10, background:"rgba(190,38,193,0.06)", border:"1px solid #BE26C1", color:"#BE26C1", fontSize:13, fontWeight:600, letterSpacing:2, cursor:"pointer", marginBottom:12, boxShadow:"0 2px 6px rgba(0,0,0,0.2)" }}>
                Top Up to {count} Questions ({count - questions.length} needed)
              </button>
            )}
            <label style={{ fontSize:11, letterSpacing:3, color:"rgba(190,38,193,0.6)", display:"block", marginBottom:8 }}>ROUND NAME</label>
            <input value={roundName} onChange={e => setRoundName(e.target.value)} placeholder="e.g. Round 1 - General Knowledge - 14 June" style={{ width:"100%", padding:"10px 16px", borderRadius:10, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.3)", boxSizing:"border-box", marginBottom:12 }} />
            <button onClick={saveRound} disabled={saving||!roundName.trim()} style={{ width:"100%", padding:14, borderRadius:10, background:roundName.trim()?"#16a34a":"#1a1a1a", color:roundName.trim()?"#fff":"#444", border:"none", fontSize:16, fontWeight:700, letterSpacing:4, cursor:roundName.trim()?"pointer":"not-allowed", boxShadow:roundName.trim()?"0 2px 12px rgba(0,0,0,0.3)":"none" }}>
              {saving ? "Saving..." : "Save Round to Library"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
