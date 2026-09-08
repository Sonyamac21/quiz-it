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
  multiple_choice: 15,
  sequence: 15,
  multi_tap: 15,
  number: 15,
  text_answer: 30,
  // Slightly longer than a plain Number question - a closest-guess estimate
  // (e.g. "How many floors does the Burj Khalifa have?") genuinely takes a
  // beat longer to reason about than an exact-answer number question does.
  nearest_wins: 20,
};

export function getTimerForQuestion(q: { question_type?: string } | null | undefined, fallback: number): number {
  if (!q || !q.question_type) return fallback;
  return TIMER_BY_TYPE[q.question_type] ?? fallback;
}
