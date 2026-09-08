// lib/quiz/generateRound.ts
//
// Batch/parallel round-generation orchestrator. The actual generation and
// validation logic (prompts, validators, AI concurrency queue, exclusion
// state) has been consolidated into ./questionGenerationCore, shared with
// the older standalone single-round generator in
// app/host/questions/page.tsx (see that file and questionGenerationCore.ts's
// header comment for the full history of why these two used to drift).
//
// This file keeps only its own orchestration layer: generateValidatedRound's
// retry/pipelining loop and generateAllRounds' batch/concurrency-scaling
// wrapper, plus the two pure round-level allocation helpers
// (allocateRegularTypes/allocateMixedDifficulties) that are specific to this
// orchestration and have no equivalent shared with page.tsx's inline logic.
//
// The one real behavioural difference from the single-round generator: the
// original page keeps all "session state" (used questions, used answers,
// rejected blacklist) in React refs shared across the whole page. That's
// fine for one round at a time, but unsafe for several rounds generating
// concurrently - two parallel calls would stomp on the same refs and
// corrupt each other's exclusion lists. Here that state is an explicit
// `ExclusionState` object passed in and returned, so each round generating in
// parallel gets (and mutates) its own bundle. Callers that want cross-round
// duplicate protection within one "Generate All" batch should pass the SAME
// bundle into each call sequentially seeded, or merge bundles between waves -
// see generateAllRounds() in this file for the batch orchestrator.

import { PURSUIT_TOTAL_QUESTIONS } from "@/lib/quiz/pursuit";
import {
  type Question,
  type ExclusionState,
  type GenerationContext,
  type GenerationReportEntry,
  type ValidationStage,
  type ValidationResult,
  shuffle,
  genUid,
  createGenerationContext,
  stageLabel,
  loadUsedQuestions,
  registerAccepted,
  blacklistRejected,
  duplicateRejectionReason,
  questionFingerprint,
  resolveAnswerText,
  generateOne,
  validateCandidate,
  commitToMemory,
  multiTapSuitabilityError,
  REGULAR_TYPE_WEIGHTS,
  REQUIRED_REGULAR_TYPES,
  MAX_AI_CONCURRENCY,
  MUSIC_TOPICS,
  PICTURE_TOPICS,
} from "@/lib/quiz/questionGenerationCore";

export type {
  Question,
  ExclusionState,
  GenerationContext,
  GenerationReportEntry,
} from "@/lib/quiz/questionGenerationCore";
export {
  emptyExclusionState,
  loadUsedQuestions,
  quickExclusionState,
  multiTapSuitabilityError,
} from "@/lib/quiz/questionGenerationCore";

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

function allocateMixedDifficulties(count: number): string[] {
  const weights: [string, number][] = [["easy", 0.3], ["medium", 0.4], ["hard", 0.3]];
  const allocated = count >= 3 ? ["easy", "medium", "hard"] : [];
  const remaining = count - allocated.length;
  if (remaining <= 0) return shuffle(allocated);
  const raw = weights.map(([, weight]) => weight * remaining);
  const base = raw.map(Math.floor);
  let remainder = remaining - base.reduce((sum, value) => sum + value, 0);
  raw.map((value, index) => ({ index, fraction: value - base[index] }))
    .sort((a, b) => b.fraction - a.fraction)
    .forEach(({ index }) => { if (remainder > 0) { base[index]++; remainder--; } });
  return shuffle([...allocated, ...weights.flatMap(([level], index) => Array(base[index]).fill(level))]);
}

// ── Public API ───────────────────────────────────────────────────────────

export type RoundGenerationSpec = {
  roundType: string;
  difficulty: string;
  theme: string;
  count: number;
  // Questions already present in this Quiz Plan round. They are validation
  // context only: never returned as newly generated questions.
  existingQuestions?: Array<Question | Record<string, unknown>>;
  // Host override for which question types this round draws from - only
  // honoured for "bonus" and "regular" rounds (the other round types have a
  // structurally fixed type mix for functional reasons: multi_tap/music/
  // pursuit/hot_seat all need a specific answer shape). Lets a host include
  // Picture and/or Music in a Bonus round, which the default bonus mix
  // deliberately excludes (see the roundType==="bonus" branch below).
  allowedQuestionTypes?: string[];
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
  // How many OTHER rounds are generating at the same time as this one, in the
  // same browser tab. Every round shares the one global MAX_AI_CONCURRENCY
  // slot pool (see withAiRequestSlot above), so a "Generate All" for a full
  // 10-round quiz gives each round a fraction of the throughput a single
  // round gets on its own - the wall-clock budget below was tuned assuming
  // near-exclusive access, so under real contention most rounds spent their
  // entire budget queued waiting for an AI slot and bailed out with 0-1
  // questions despite Include-in-Generate-All being checked. Scaling the
  // budget by how contended the slot pool actually is fixes that without
  // giving a single round generated on its own any extra time it doesn't need.
  wallClockScale = 1,
): Promise<RoundGenerationResult> {
  const { roundType, difficulty, theme } = spec;
  const existingQuestions = (spec.existingQuestions || []) as Question[];
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
  // Codex pre-launch review, finding #9: the permanent Question Memory
  // check/write "fails open" on a Supabase error - the candidate is allowed
  // through (or accepted without being remembered) rather than blocking
  // generation entirely on a transient infra blip, which was a deliberate
  // tradeoff (see isDuplicateInMemory's own comments on an earlier version
  // that failed closed and stalled entire rounds on unrelated errors). What
  // was missing was ANY visibility into that happening - a run degraded
  // this way looked identical to a fully healthy one. This counter surfaces
  // it in the round's own finalStatus message instead.
  let memoryDegradedCount = 0;
  const degradedSuffix = () => memoryDegradedCount > 0
    ? " (note: the permanent duplicate-memory check was unavailable for " + memoryDegradedCount + " question" + (memoryDegradedCount === 1 ? "" : "s") + " during this run - duplicate protection may be reduced for those.)"
    : "";
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
  if ((roundType === "bonus" || roundType === "regular") && spec.allowedQuestionTypes && spec.allowedQuestionTypes.length > 0) {
    // Host-picked type mix (e.g. "include Picture and Music in this Bonus
    // round") overrides the default fixed pool below. Cycled + shuffled the
    // same way every other fixed-pool branch here builds its array.
    const pool = spec.allowedQuestionTypes;
    types = shuffle(Array.from({ length: count }, (_, i) => pool[i % pool.length]));
  } else if (roundType === "music") {
    types = Array(count).fill("audio");
  } else if (roundType === "multi_tap") {
    types = Array(count).fill("multi_tap");
  } else if (roundType === "nearest_wins") {
    types = Array(count).fill("nearest_wins");
  } else if (roundType === "pursuit") {
    types = shuffle(Array.from({ length: count }, (_, i) => ["multiple_choice", "text_answer", "number", "sequence"][i % 4]));
  } else if (roundType === "hot_seat") {
    types = shuffle(Array.from({ length: count }, (_, i) => ["multiple_choice", "text_answer", "number", "sequence"][i % 4]));
  } else if (roundType === "bonus") {
    // A short themed bonus round must not inherit the regular round's
    // mandatory picture/music slots: those force tenuous links and leave
    // simple themes short after media and theme validation reject them.
    types = shuffle(Array.from({ length: count }, (_, i) => ["multiple_choice", "text_answer", "multiple_choice", "text_answer", "number"][i % 5]));
  } else {
    // Guarantee the five commercial core formats once a round has at least
    // five questions, then distribute remaining slots by largest remainder.
    // This prevents a short regular round from silently omitting music or a
    // number answer because percentage rounding happened to favour another
    // category.
    types = allocateRegularTypes(count);
  }

  // A round with NO host-supplied theme used to draw its topic purely at
  // random from the full flat TOPICS list every launch. Bucketing TOPICS
  // into categories and cycling ROUND-ROBIN through the buckets (picking a
  // random not-yet-used topic within whichever bucket is due next)
  // guarantees every category gets a fair, spread-out share of every
  // unthemed round.
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
  const shuffledBuckets = TOPIC_BUCKETS.map(shuffle);
  const triedGeneralTopics = new Set<string>();
  const pickGeneralTopic = (launchIndex: number): string => {
    const bucket = shuffledBuckets[launchIndex % shuffledBuckets.length];
    for (let offset = 0; offset < bucket.length; offset++) {
      const candidate = bucket[(Math.floor(launchIndex / shuffledBuckets.length) + offset) % bucket.length];
      if (!triedGeneralTopics.has(candidate)) { triedGeneralTopics.add(candidate); return candidate; }
    }
    for (const b of shuffledBuckets) {
      for (const candidate of b) {
        if (!triedGeneralTopics.has(candidate)) { triedGeneralTopics.add(candidate); return candidate; }
      }
    }
    return bucket[launchIndex % bucket.length];
  };
  const shuffledMusicTopics = shuffle(MUSIC_TOPICS);
  const shuffledPictureTopics = shuffle(PICTURE_TOPICS);
  const good: Question[] = [];
  let attempts = 0;
  const maxAttempts = roundType === "multi_tap" ? count * 24 : count * 18;
  const generationStartedAt = Date.now();
  const baseWallClockBudgetMs = roundType === "multi_tap"
    ? Math.max(150_000, count * 35_000)
    : Math.max(120_000, count * 25_000);
  const wallClockBudgetMs = Math.round(baseWallClockBudgetMs * Math.min(5, Math.max(1, wallClockScale)));
  let i = 0;
  let consecutiveFailures = 0;
  let consecutiveCheckFailures = 0;
  let consecutiveMemoryFailures = 0;

  const triedPictureTopics = new Set<string>();
  const pickPictureTopic = (launchIndex: number): string => {
    for (let offset = 0; offset < shuffledPictureTopics.length; offset++) {
      const candidate = shuffledPictureTopics[(launchIndex + offset) % shuffledPictureTopics.length];
      if (!triedPictureTopics.has(candidate)) { triedPictureTopics.add(candidate); return candidate; }
    }
    return shuffledPictureTopics[launchIndex % shuffledPictureTopics.length];
  };

  const targetCounts: Record<string, number> = {};
  types.forEach(t => { targetCounts[t] = (targetCounts[t] || 0) + 1; });
  const acceptedCounts: Record<string, number> = {};
  const inFlightCounts: Record<string, number> = {};
  const difficultyPlan = difficulty === "mixed" ? allocateMixedDifficulties(count) : Array(count).fill(difficulty);
  const difficultyTargets: Record<string, number> = {};
  difficultyPlan.forEach(level => { difficultyTargets[level] = (difficultyTargets[level] || 0) + 1; });
  const acceptedDifficultyCounts: Record<string, number> = {};
  const inFlightDifficultyCounts: Record<string, number> = {};
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
  const pickNextDifficulty = (): string => {
    let best = Object.keys(difficultyTargets)[0];
    let bestDeficit = -Infinity;
    for (const level of Object.keys(difficultyTargets)) {
      const deficit = difficultyTargets[level] - (acceptedDifficultyCounts[level] || 0) - (inFlightDifficultyCounts[level] || 0);
      if (deficit > bestDeficit) { bestDeficit = deficit; best = level; }
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

  type PendingCandidate = { type: string; candidateDifficulty: string; multiTapCorrectCount?: number; context: GenerationContext; promise: Promise<Question | null> };
  const pending: PendingCandidate[] = [];
  const launchCandidate = () => {
    const launchIndex = i++;
    const type = pickNextType();
    const candidateDifficulty = pickNextDifficulty();
    const multiTapCorrectCount = pickNextMultiTapCount();
    const topic = theme || (
      type === "audio" ? shuffledMusicTopics[launchIndex % shuffledMusicTopics.length]
      : type === "picture" ? pickPictureTopic(launchIndex)
      : pickGeneralTopic(launchIndex)
    );
    const context = createGenerationContext(type, Boolean(theme.trim()));
    attempts++;
    inFlightCounts[type] = (inFlightCounts[type] || 0) + 1;
    inFlightDifficultyCounts[candidateDifficulty] = (inFlightDifficultyCounts[candidateDifficulty] || 0) + 1;
    if (multiTapCorrectCount) inFlightMultiTapCounts[multiTapCorrectCount] = (inFlightMultiTapCounts[multiTapCorrectCount] || 0) + 1;
    // forceObscure used to ONLY trigger reactively, after 4 consecutive
    // duplicate/memory rejections in a row. Now also fires proactively on a
    // portion of candidates from the start.
    const proactiveObscure = Math.random() < 0.3;
    pending.push({ type, candidateDifficulty, multiTapCorrectCount, context, promise: generateOne(type, topic, context, { theme, difficulty: candidateDifficulty, roundType, exclusions, forceObscure: consecutiveMemoryFailures >= 4 || proactiveObscure, multiTapCorrectCount }) });
  };
  const refillPipeline = () => {
    // Deliberately keeps up to 3 candidates in flight even once `count` is
    // nearly/already covered by good+pending.
    while (pending.length < 3 && attempts < maxAttempts) launchCandidate();
  };
  refillPipeline();

  while (good.length < count && pending.length > 0) {
    if (Date.now() - generationStartedAt > wallClockBudgetMs) {
      const finalStatus = "Generation stopped after " + Math.round((Date.now() - generationStartedAt) / 1000) + "s to avoid an excessive wait. Got " + good.length + " of " + count + " - use Generate More to top up the rest, or try a different/more specific theme." + degradedSuffix();
      onProgress?.(finalStatus);
      return { spec, questions: good, report, finalStatus, stoppedEarly: true };
    }
    onProgress?.("Generating and checking question " + (good.length + 1) + " of " + count + "..." + (consecutiveFailures > 0 ? " (retry " + consecutiveFailures + ")" : ""));
    const current = pending.shift()!;
    const { type, candidateDifficulty, multiTapCorrectCount, context } = current;
    const q = await current.promise;
    inFlightCounts[type] = Math.max(0, (inFlightCounts[type] || 0) - 1);
    inFlightDifficultyCounts[candidateDifficulty] = Math.max(0, (inFlightDifficultyCounts[candidateDifficulty] || 0) - 1);
    if (multiTapCorrectCount) inFlightMultiTapCounts[multiTapCorrectCount] = Math.max(0, (inFlightMultiTapCounts[multiTapCorrectCount] || 0) - 1);
    if (!q) {
      reportGeneratedFailure(context, type);
      consecutiveFailures++;
      const err = context.error.toLowerCase();
      const isPersistent = err.includes("api_key") || err.includes("api key") || err.includes("unauthorized")
        || err.includes("not logged in") || err.includes("authentication") || err.includes("rate limit")
        || err.includes("too many requests") || err.includes("prompt too long") || consecutiveFailures >= 6;
      if (isPersistent) {
        const finalStatus = "Generation failed after " + consecutiveFailures + " attempts: " + (context.error || "unknown error") + degradedSuffix();
        onProgress?.(finalStatus);
        return { spec, questions: good, report, finalStatus, stoppedEarly: true };
      }
      refillPipeline();
      continue;
    }
    consecutiveFailures = 0;
    onProgress?.("Checking question " + (good.length + 1) + " of " + count + "...");
    const validation = await validateCandidate(q, [...existingQuestions, ...good], context.report.stages, theme, exclusions, () => { memoryDegradedCount++; });
    // validateCandidate's own duplicate check ran BEFORE the several awaited
    // moderation/quality/memory calls above - during that gap, a sibling
    // round generating at the same time can land the exact same
    // fact-question. Re-running the FULL duplicate comparison one last time,
    // synchronously, right before commit closes that window.
    const finalDuplicateReason = validation.ok
      ? duplicateRejectionReason(q, [...existingQuestions, ...good], theme, exclusions)
      : null;
    if (validation.ok && finalDuplicateReason) {
      addReportEntry({ outcome: "rejected", questionText: q.question_text, questionType: q.question_type, category: "Duplicate", reason: "Late cross-round conflict: " + finalDuplicateReason, stages: context.report.stages });
      consecutiveCheckFailures++;
      consecutiveMemoryFailures++;
      refillPipeline();
      continue;
    }
    if (validation.ok) {
      await commitToMemory(q, () => { memoryDegradedCount++; });
      good.push(q);
      acceptedCounts[type] = (acceptedCounts[type] || 0) + 1;
      acceptedDifficultyCounts[candidateDifficulty] = (acceptedDifficultyCounts[candidateDifficulty] || 0) + 1;
      if (multiTapCorrectCount) acceptedMultiTapCounts[multiTapCorrectCount] = (acceptedMultiTapCounts[multiTapCorrectCount] || 0) + 1;
      registerAccepted(exclusions, q);
      onAccept?.(q);
      addReportEntry({ outcome: "accepted", questionText: q.question_text, questionType: q.question_type, category: validation.category, reason: validation.reason, stages: validation.stages });
      consecutiveCheckFailures = 0;
      consecutiveMemoryFailures = 0;
    } else {
      if (validation.category === "Moderation unavailable") {
        addReportEntry({ outcome: "rejected", questionText: q.question_text, questionType: q.question_type, category: validation.category, reason: validation.reason, stages: validation.stages });
        const finalStatus = "Generation stopped because moderation could not be reached. " + validation.reason + degradedSuffix();
        onProgress?.(finalStatus);
        return { spec, questions: good, report, finalStatus, stoppedEarly: true };
      }
      blacklistRejected(exclusions, q);
      addReportEntry({ outcome: "rejected", questionText: q.question_text, questionType: q.question_type, category: validation.category, reason: validation.reason, stages: validation.stages });
      consecutiveCheckFailures++;
      consecutiveMemoryFailures = (validation.category === "Duplicate" || validation.category === "Permanent memory") ? consecutiveMemoryFailures + 1 : 0;
      const failReason = (validation.reason || "Unknown reason").substring(0, 40);
      onProgress?.("Question " + (good.length + 1) + " failed check (" + failReason + ") - retrying..." + (consecutiveMemoryFailures >= 4 ? " (widening search for a fresh angle)" : ""));
      if (consecutiveCheckFailures >= 45) {
        const finalStatus = "Generation stalled after " + consecutiveCheckFailures + " questions in a row failing validation (latest: " + validation.category + " — " + (validation.reason || "Unknown reason").substring(0, 60) + "). Got " + good.length + " of " + count + ". This topic/theme may be close to exhausted in your saved question history - try a different or more specific theme. See Generation Report for details." + degradedSuffix();
        onProgress?.(finalStatus);
        return { spec, questions: good, report, finalStatus, stoppedEarly: true };
      }
    }
    refillPipeline();
  }

  const finalStatus = (good.length === count
    ? "Ready - " + good.length + " of " + count + " questions generated."
    : good.length + " of " + count + " questions ready.") + degradedSuffix();
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
  onRoundComplete?: (roundIndex: number, result: RoundGenerationResult) => void | Promise<void>,
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
  // quiz_rounds is a live Quiz Plan snapshot and is not guaranteed to have
  // been copied into the permanent library yet. Seed each request with its
  // own existing questions so a top-up cannot recreate an answer/fact that
  // is already visibly present in that same round.
  const allExistingQuestions = specs.flatMap(spec => spec.existingQuestions || []);
  specs.forEach((_spec, idx) => {
    allExistingQuestions.forEach(question => registerAccepted(perRoundExclusions[idx], question as Question));
  });
  // Broadcasts a just-accepted question from one round into every OTHER
  // round's exclusion bundle immediately, so two rounds generating at the
  // same time can't both land the same brand-new question before either has
  // been saved to the database.
  const broadcastAccept = (fromIdx: number, q: Question) => {
    perRoundExclusions.forEach((state, j) => {
      if (j === fromIdx) return;
      state.used = [...state.used, q.question_text];
      state.usedFingerprints.add(questionFingerprint(q));
      const normAnswer = resolveAnswerText(q).toLowerCase().trim();
      if (normAnswer) state.usedAnswers = [...state.usedAnswers, normAnswer];
    });
  };
  // Every round shares the same MAX_AI_CONCURRENCY slot pool, so the more
  // rounds are generating at once, the less real throughput each one
  // actually gets - roughly proportional to specs.length once there are
  // more rounds than concurrency slots.
  const ROUND_PIPELINE_DEPTH = 3;
  const wallClockScale = Math.max(1, (specs.length * ROUND_PIPELINE_DEPTH) / MAX_AI_CONCURRENCY);
  return Promise.all(
    specs.map(async (spec, idx) => {
      // A single round throwing (network hiccup, unexpected API shape, etc.)
      // must never reject the whole Promise.all.
      try {
        const result = await generateValidatedRound(spec, perRoundExclusions[idx], status => onProgress?.(idx, status), q => broadcastAccept(idx, q), wallClockScale);
        await onRoundComplete?.(idx, result);
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
