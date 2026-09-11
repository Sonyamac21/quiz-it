"use client";
import { useState, useRef, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ImageUploader } from "@/components/ImageUploader";
import { AudioUploader } from "@/components/AudioUploader";
import { PURSUIT_TOTAL_QUESTIONS } from "@/lib/quiz/pursuit";
import { HostShell, HostButton, HostInput, Chip } from "@/components/fable/HostConsole";
import {
  type Question,
  type ValidationStage,
  type ValidationResult,
  type ValidationResults,
  type GenerationReportEntry,
  type ExclusionState,
  type GenerationContext,
  emptyExclusionState,
  loadUsedQuestions as loadUsedQuestionsCore,
  quickExclusionState,
  blacklistRejected as blacklistRejectedCore,
  registerAccepted as registerAcceptedCore,
  createGenerationContext,
  stageLabel,
  shuffle,
  genUid,
  MUSIC_TOPICS,
  PICTURE_TOPICS,
  REGULAR_TYPE_WEIGHTS,
  REQUIRED_REGULAR_TYPES,
  generateOne,
  validateCandidate,
  commitToMemory,
} from "@/lib/quiz/questionGenerationCore";

const STAGE_BG = "radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118";
const fableSelect: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 14, background: "#150A2E", color: "#fff", border: "1px solid #2E1A52", fontSize: 13, fontFamily: "'Inter',sans-serif", outline: "none" };
const fableTextarea: React.CSSProperties = { padding: "10px 14px", borderRadius: 14, background: "#150A2E", color: "#fff", border: "1px solid #2E1A52", fontSize: 13, fontFamily: "'Inter',sans-serif", outline: "none", resize: "vertical" };

// Question, the validation result/report types, and the generator/validator
// pipeline itself (generateOne/validateCandidate/commitToMemory, plus the
// constants above) all now live in lib/quiz/questionGenerationCore.ts,
// shared with lib/quiz/generateRound.ts's bulk generator. See that module's
// header comment for the consolidation history. This page keeps only its
// own orchestration (generate/topUp/removeAndReplace), UI state, and the
// two pure allocation helpers below, which have no shared equivalent.

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
// The recency bucket is listed TWICE (matches lib/quiz/generateRound.ts) so
// it comes up roughly every 5-6 questions instead of every 10 - a single
// slot in ten read as "basically never" per direct host feedback.
const TOPIC_BUCKETS: string[][] = [
  ["breaking and trending mainstream headlines from the last 1-6 months (completed stories only; no politics, war or tragedy)", "recent mainstream news from the last 3-12 months"],
  ["movies and TV", "celebrities and showbiz", "awards and entertainment"],
  ["music", "famous bands and singers", "global chart hits"],
  ["geography", "famous landmarks", "world travel and international culture"],
  ["simple history", "famous historical people", "major world events"],
  ["sport", "football", "international sporting events"],
  ["breaking celebrity, showbiz and pop-culture news from the last 1-6 months (completed stories only; no politics, war or tragedy)", "recent trending pop-culture moments from the last 3-12 months"],
  ["accessible science and space", "animals", "nature and wildlife"],
  ["food and drink", "logos and brands", "cars and transport"],
  ["consumer technology and digital life", "video games", "social media and internet"],
  ["books and literature", "art and culture", "theatre and musicals"],
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
const typeLabel: Record<string,string> = { multi_tap:"Multi Tap", multiple_choice:"Multiple Choice", text_answer:"Text Answer", number:"Number", sequence:"Sequence", picture:"Picture Round", audio:"Name That Tune", nearest_wins:"Nearest Wins" };

export default function QuestionsPage() {
  const [roundType, setRoundType] = useState("regular");
  const [difficulty, setDifficulty] = useState("mixed");
  const [theme, setTheme] = useState("");
  const [questionCount, setQuestionCount] = useState(15);
  // The Pursuit is always exactly 7 gates. The generator reads this single `count`
  // value, so Pursuit runs the identical pipeline with the length fixed inline —
  // no separate effect or second code path.
  const count = roundType === "pursuit" ? PURSUIT_TOTAL_QUESTIONS : roundType === "hot_seat" ? 5 : questionCount;
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
  // All session exclusion/duplicate-tracking state (used questions/answers,
  // rejected blacklist) is now a single ExclusionState bundle from the
  // shared questionGenerationCore module, instead of five separate refs.
  // That module's ExclusionState was originally designed so several rounds
  // could generate concurrently without corrupting each other's state (see
  // that module's header comment); a single ref holding one bundle is the
  // direct equivalent of the old five-refs setup for this single-round page.
  const exclusionsRef = useRef<ExclusionState>(emptyExclusionState());
  const dragIdx = useRef<number|null>(null);

  // Record a produced-but-rejected question so it is never regenerated/accepted
  // again this session.
  function blacklistRejected(q: Question) {
    blacklistRejectedCore(exclusionsRef.current, q);
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

  useEffect(() => { refreshUsedQuestions(); }, []);

  // Wraps the shared loadUsedQuestions() (same permanent all-time history
  // fetch generateRound.ts uses) and stores it into this page's single
  // ExclusionState ref.
  async function refreshUsedQuestions() {
    exclusionsRef.current = await loadUsedQuestionsCore();
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

  // Duplicate detection, round balance, permanent Question Memory, moderation
  // and final quality now all live in the shared validateCandidate (see
  // questionGenerationCore.ts) - this thin wrapper just supplies this page's
  // theme/exclusion state so call sites below don't change shape.
  function runValidateCandidate(q: Question, currentRound: Question[], stages: ValidationResults) {
    return validateCandidate(q, currentRound, stages, theme, exclusionsRef.current, undefined);
  }

  function registerAccepted(q: Question) {
    registerAcceptedCore(exclusionsRef.current, q);
  }

  async function pickFromLibrary(type: string, excludeIds: Set<number>): Promise<Question | null> {
    const supabase = createSupabaseBrowserClient();
    // Auto-generation must never repeat a question that's already been used
    // live, full stop - only ever draw from rows with no last_used_at at
    // all. Manually picking an already-used question back into a round is
    // still fine (that's a deliberate host choice, handled elsewhere); this
    // function only feeds the automatic generator.
    const { data: poolA } = await supabase.from("questions").select("*").eq("question_type", type).eq("is_active", true).is("last_used_at", null).limit(50);
    const a = (poolA || []).filter(r => !excludeIds.has(r.id as number) && isLibraryRowUsable(r));
    if (a.length === 0) return null;
    const row = a[Math.floor(Math.random() * a.length)];
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
    exclusionsRef.current = {
      ...exclusionsRef.current,
      rejectedFingerprints: new Set(),
      rejectedTexts: new Set(),
    };
    let types: string[];
    if (roundType === "music") {
      types = Array(count).fill("audio");
    } else if (roundType === "multi_tap") {
      types = Array(count).fill("multi_tap");
    } else if (roundType === "nearest_wins") {
      types = Array(count).fill("nearest_wins");
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
    const multiTapAnswerPlan = roundType === "multi_tap"
      ? shuffle(Array.from({ length: count }, (_, index) => (index % 5) + 2))
      : [];
    const multiTapTargets: Record<number, number> = {};
    multiTapAnswerPlan.forEach(answerCount => { multiTapTargets[answerCount] = (multiTapTargets[answerCount] || 0) + 1; });
    const acceptedMultiTapCounts: Record<number, number> = {};
    const inFlightMultiTapCounts: Record<number, number> = {};
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
    const pickNextMultiTapCount = (): number | undefined => {
      if (roundType !== "multi_tap") return undefined;
      let best = 2;
      let bestDeficit = -Infinity;
      for (const rawCount of Object.keys(multiTapTargets)) {
        const answerCount = Number(rawCount);
        const deficit = multiTapTargets[answerCount] - (acceptedMultiTapCounts[answerCount] || 0) - (inFlightMultiTapCounts[answerCount] || 0);
        if (deficit > bestDeficit) { bestDeficit = deficit; best = answerCount; }
      }
      return best;
    };
    type PendingCandidate = {
      type: string;
      multiTapCorrectCount?: number;
      context: GenerationContext;
      promise: Promise<Question | null>;
    };
    const pending: PendingCandidate[] = [];
    const launchCandidate = () => {
      const launchIndex = i++;
      const type = pickNextType();
      const multiTapCorrectCount = pickNextMultiTapCount();
      const topic = theme || (
        type === "audio" ? shuffledMusicTopics[launchIndex % shuffledMusicTopics.length]
        : type === "picture" ? pickPictureTopic(launchIndex)
        : pickGeneralTopic(launchIndex)
      );
      const context = createGenerationContext(type, Boolean(theme.trim()));
      attempts++;
      inFlightCounts[type] = (inFlightCounts[type] || 0) + 1;
      if (multiTapCorrectCount) inFlightMultiTapCounts[multiTapCorrectCount] = (inFlightMultiTapCounts[multiTapCorrectCount] || 0) + 1;
      pending.push({ type, multiTapCorrectCount, context, promise: generateOne(type, topic, context, { theme, difficulty, roundType, exclusions: exclusionsRef.current, multiTapCorrectCount }) });
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
      const { type, multiTapCorrectCount, context } = current;
      const q = await current.promise;
      inFlightCounts[type] = Math.max(0, (inFlightCounts[type] || 0) - 1);
      if (multiTapCorrectCount) inFlightMultiTapCounts[multiTapCorrectCount] = Math.max(0, (inFlightMultiTapCounts[multiTapCorrectCount] || 0) - 1);
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
      const validation = await runValidateCandidate(q, good, context.report.stages);
      // Gate order: moderation -> in-round duplicate detection -> Round Balance
      // (unthemed rounds only) -> permanent Question Memory (cross-session) ->
      // FINAL quiz quality check. Each stage is short-circuited so the expensive
      // AI checks only run once the cheaper ones pass; the final quality judge is
      // the very last gate before acceptance.
      if (validation.ok) {
        await commitToMemory(q); // accepted -> becomes part of permanent memory
        good.push(q);
        acceptedCounts[type] = (acceptedCounts[type] || 0) + 1;
        if (multiTapCorrectCount) acceptedMultiTapCounts[multiTapCorrectCount] = (acceptedMultiTapCounts[multiTapCorrectCount] || 0) + 1;
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
      const candidate = await generateOne(removed.question_type, replaceTopic, context, { theme, difficulty, roundType, exclusions: exclusionsRef.current });
      if (!candidate) {
        lastReplacementError = context.error;
        reportGeneratedFailure(context, removed.question_type);
        continue;
      } // AI produced nothing/invalid - try again
      // Compare against every OTHER question currently in the round (excluding the
      // one being replaced) so the replacement isn't rejected for matching the
      // very item it is swapping out.
      const currentRound = questions.filter(x => x._uid !== removedUid);
      const validation = await runValidateCandidate(candidate, currentRound, context.report.stages);
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
      roundType === "nearest_wins" ? ["nearest_wins"] :
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
      const q = await generateOne(type, topic, context, { theme, difficulty, roundType, exclusions: exclusionsRef.current });
      if (!q) { reportGeneratedFailure(context, type); continue; }
      const currentForTopup = [...questions, ...added];
      const validation = await runValidateCandidate(q, currentForTopup, context.report.stages);
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
    refreshUsedQuestions();
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
        {/* Same leftover-duplicate-header cleanup as Round Library and Music
            Prep - the site-wide header/nav already renders above this page
            via app/host/layout.tsx's BackOfficeShell, so this page's own
            separate mini header (tiny wordmark, its own Events/Round Library
            links) was a jarring, differently-styled second header. */}

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
                <option value="nearest_wins">Nearest Wins round</option>
                <option value="pursuit">The Pursuit</option>
                <option value="hot_seat">Hot Seat</option>
              </select>
            </div>
            <div>
              <div className="fbh-lbl">Questions</div>
              {roundType === "pursuit" || roundType === "hot_seat" ? (
                <div style={{ ...fableSelect, color:"#6B5A8E" }}>{roundType === "pursuit" ? PURSUIT_TOTAL_QUESTIONS : 5} questions (fixed)</div>
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
                <li>Wrong answers do not eliminate anyone; every team plays all seven questions.</li>
                <li>The highest correct total wins a 100-point bonus. Tied leaders each receive it.</li>
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
              {/* Type select and question text used to stack as two separate
                  full-width rows - side by side instead, since the select is
                  never more than a few words wide and was leaving a wide
                  empty strip beside it. */}
              <div style={{ display: "flex", gap: 10 }}>
                <select value={manualType} onChange={e => setManualType(e.target.value)} style={{ ...fableSelect, flex: "0 0 170px" }}>
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="text_answer">Text Answer</option>
                  <option value="number">Number</option>
                  <option value="sequence">Sequence</option>
                  <option value="multi_tap">Multi Tap</option>
                </select>
                <textarea value={manualText} onChange={e => setManualText(e.target.value)} placeholder="Question text…" rows={2} style={{ ...fableTextarea, flex: 1 }} />
              </div>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <HostInput value={manualCorrect} onChange={e => setManualCorrect(e.target.value)}
                  placeholder={manualType === "multiple_choice" ? "Correct answer letter, e.g. b" : manualType === "sequence" ? "Correct order, e.g. a,b,c,d" : manualType === "multi_tap" ? "Correct letters, e.g. b,d,f" : "Correct answer"} />
                <HostInput value={manualExplanation} onChange={e => setManualExplanation(e.target.value)} placeholder="Explanation (optional)" />
              </div>
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
              {/* Name field and Save button used to each take their own
                  full-width row - side by side instead, name gets the room
                  and the button doesn't need to stretch the full width to
                  be usable. */}
              <div className="fbh-lbl">Round Name</div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <HostInput value={roundName} onChange={e => setRoundName(e.target.value)} placeholder="e.g. Round 1 - General Knowledge - 14 June" style={{ flex: 1 }} />
                <HostButton variant="pri" big onClick={saveRound} disabled={saving||!roundName.trim()} style={{ flex: "0 0 220px" }}>
                  {saving ? "SAVING…" : "SAVE ROUND TO LIBRARY"}
                </HostButton>
              </div>
            </div>
          </>
        )}
      </div>
    </HostShell>
  );
}
