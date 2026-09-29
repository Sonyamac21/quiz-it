// Per-question-type timer defaults, confirmed by host: Multiple Choice,
// Sequence, Multi Tap, and Number need less thinking time than written
// text answers. Picture and Audio aren't in this map, so they fall back to
// the host's manual timer setting since those need variable time depending
// on content.
//
// Shared between the main round flow (app/host/quiz/page.tsx) and The
// Pursuit (components/PursuitPanel.tsx) - Pursuit used to run every
// question on the same flat manual timer regardless of type, so a 4-option
// multiple choice question got the same 30s as a written text-answer
// question, which felt far too slow. Both surfaces now read from the same
// map so a type's timing can never drift between them.
export const TIMER_BY_TYPE: Record<string, number> = {
  multiple_choice: 10,
  sequence: 15,
  multi_tap: 10,
  number: 10,
  text_answer: 20,
  text: 20,
  nearest_wins: 10,
};

export function getTimerForQuestion(q: { question_type?: string; correct_answer?: string | null } | null | undefined, fallback: number): number {
  if (!q || !q.question_type) return fallback;
  // Match the numeric keypad used for legacy text questions with numeric answers.
  if (["text", "text_answer"].includes(q.question_type) && /^\d+$/.test((q.correct_answer ?? "").trim())) return 10;
  return TIMER_BY_TYPE[q.question_type] ?? fallback;
}
