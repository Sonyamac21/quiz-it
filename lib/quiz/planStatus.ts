// A Quiz Plan being linked to an event isn't the same as that plan actually
// being finished - every round still needs questions, and every audio
// question still needs an actual saved clip from Music Prep (option_b
// pointing at a real uploaded blob), not just a generated search query.
// Ready-to-host only when both are true.
//
// This used to live only inside app/host/page.tsx (the dashboard), which
// meant the Calendar page's "PREPARE LIVE QUIZ" button and the planner
// itself had no way to warn a host their quiz can't actually go live yet -
// the only place this was ever surfaced was a "Ready to host"/"Continue
// planning" label on the dashboard's event rows.
//
// questions is typed `unknown[]` (not Record<string,unknown>[]) so this
// accepts whichever shape each caller's Supabase select produced (the
// dashboard, Calendar, and planner each declare their own local row types)
// without needing a cast at every call site.
import { readPairsQuestions } from "./pairs.ts";
type PlanRound = { id: string; round_type: string; questions: unknown[]; name?: string; target_count?: number | null };
type Plan = { quiz_rounds?: PlanRound[] } | null | undefined;

function asQuestion(q: unknown): { question_type?: unknown; option_b?: unknown } {
  return (q ?? {}) as { question_type?: unknown; option_b?: unknown };
}

export type QuizPreflightIssue = {
  code: string;
  message: string;
  roundId?: string;
};

export type QuizPreflight = {
  ready: boolean;
  blockers: QuizPreflightIssue[];
  warnings: QuizPreflightIssue[];
};

const QUESTION_ROUND_TYPES = new Set(["regular", "music", "multi_tap", "nearest_wins", "pursuit", "hot_seat", "bonus", "pairs"]);

function normalisedKeys(value: unknown): string[] {
  return String(value ?? "").toLowerCase().split(",").map(item => item.trim()).filter(Boolean);
}

// One authoritative readiness result used immediately before a live session.
// Planning pages may show additional advice, but none of them should disagree
// about whether the selected quiz can safely be snapshotted and delivered.
export function getQuizPreflight(quiz: Plan): QuizPreflight {
  const blockers: QuizPreflightIssue[] = [];
  const warnings: QuizPreflightIssue[] = [];
  const rounds = quiz?.quiz_rounds || [];
  if (!rounds.length) blockers.push({ code: "no-rounds", message: "The Quiz Plan has no rounds." });

  for (const round of rounds) {
    const questions = Array.isArray(round.questions) ? round.questions : [];
    const roundName = round.name || "An unnamed round";
    const count = round.round_type === "pairs" ? readPairsQuestions(questions).length : questions.length;
    if (QUESTION_ROUND_TYPES.has(round.round_type) && round.target_count != null && (!Number.isInteger(round.target_count) || round.target_count < 1 || count !== round.target_count)) {
      blockers.push({ code: "target-count", roundId: round.id, message: `${roundName} needs ${round.target_count} questions; currently ${count} are ready.` });
    }
    if (QUESTION_ROUND_TYPES.has(round.round_type) && questions.length === 0) {
      blockers.push({ code: "empty-round", roundId: round.id, message: `${roundName} has no questions.` });
      continue;
    }
    if (round.round_type === "hot_seat" && questions.length !== 5) {
      blockers.push({ code: "hot-seat-count", roundId: round.id, message: `${roundName} must contain exactly 5 questions (currently ${questions.length}).` });
    }
    if (round.round_type === "pursuit" && questions.length !== 7) {
      blockers.push({ code: "pursuit-count", roundId: round.id, message: `${roundName} must contain exactly 7 questions (currently ${questions.length}).` });
    }
    if (round.round_type === "pairs" && (readPairsQuestions(questions).length === 0 || (questions.some(q => Array.isArray((q as { pairs?: unknown })?.pairs)) && readPairsQuestions(questions).length !== questions.length))) {
      blockers.push({ code: "pairs-incomplete", roundId: round.id, message: `${roundName} needs three complete, distinct pairs per question.` });
    }

    questions.forEach((raw, index) => {
      const question = (raw || {}) as Record<string, unknown>;
      const label = `${roundName}, question ${index + 1}`;
      if (round.round_type === "pairs" || !QUESTION_ROUND_TYPES.has(round.round_type)) return;
      const type = String(question.question_type || "");
      const answer = String(question.correct_answer ?? "").trim();
      if (!String(question.question_text || "").trim() || !answer || !["multiple_choice", "multi_tap", "sequence", "text", "text_answer", "number", "nearest_wins", "picture", "audio"].includes(type)) {
        blockers.push({ code: "invalid-question", roundId: round.id, message: `${label} needs a question, a supported question type and an answer.` });
      }
      if (["multiple_choice", "sequence", "multi_tap"].includes(type)) {
        const allowed = type === "multi_tap" ? ["a", "b", "c", "d", "e", "f"] : ["a", "b", "c", "d"];
        const keys = normalisedKeys(answer);
        const options = allowed.map(key => String(question[`option_${key}`] || "").trim());
        const invalid = options.some(option => !option) || new Set(options.map(option => option.toLowerCase())).size !== options.length || new Set(keys).size !== keys.length || keys.some(key => !allowed.includes(key)) || (type === "multiple_choice" ? keys.length !== 1 : type === "sequence" ? keys.length !== 4 : keys.length < 2);
        if (invalid) blockers.push({ code: "invalid-options", roundId: round.id, message: `${label} needs distinct, complete options and a valid answer key.` });
      }
      if (["number", "nearest_wins"].includes(type) && (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(answer) || !Number.isFinite(Number(answer)))) {
        blockers.push({ code: "invalid-number", roundId: round.id, message: `${label} needs a numeric answer.` });
      }
      if (question.question_type === "audio") {
        const clip = String(question.option_b || "");
        if (!/^https?:\/\//i.test(clip) && !clip.startsWith("/")) blockers.push({ code: "music-unprepped", roundId: round.id, message: `${label} has no saved music clip.` });
      }
      if (question.question_type === "picture") {
        const image = String(question.option_b || "");
        if (!/^https?:\/\//i.test(image) && !image.startsWith("/")) blockers.push({ code: "picture-unprepped", roundId: round.id, message: `${label} has no saved picture.` });
      }
      if (round.round_type === "multi_tap") {
        const keys = normalisedKeys(question.correct_answer);
        const hasSixOptions = ["a", "b", "c", "d", "e", "f"].every(key => String(question[`option_${key}`] || "").trim());
        if (question.question_type !== "multi_tap" || !hasSixOptions || keys.length < 2 || keys.some(key => !["a", "b", "c", "d", "e", "f"].includes(key))) {
          blockers.push({ code: "invalid-multi-tap", roundId: round.id, message: `${label} is not a valid Multi Tap question with six options and at least two correct answers.` });
        }
      }
    });
  }

  return { ready: blockers.length === 0, blockers, warnings };
}

export function isQuizPlanComplete(quiz: Plan): boolean {
  return getQuizPreflight(quiz).ready;
}

// A single round's audio questions are all prepped (or it has none).
export function roundMusicIsPrepped(round: { questions: unknown[] }): boolean {
  if (!round.questions || round.questions.length === 0) return false;
  return round.questions.every(raw => {
    const q = asQuestion(raw);
    if (q.question_type !== "audio") return true;
    const clip = q.option_b as string | undefined | null;
    return Boolean(clip && clip.includes("blob.vercel-storage.com"));
  });
}

// Which of a plan's rounds still have unprepped music, for a warning list
// ("Round 3, Round 6 still need Music Prep") rather than a flat yes/no.
export function unpreppedMusicRounds(quiz: Plan): PlanRound[] {
  const rounds = quiz?.quiz_rounds;
  if (!rounds) return [];
  return rounds.filter(round => round.questions.some(q => asQuestion(q).question_type === "audio") && !roundMusicIsPrepped(round));
}
