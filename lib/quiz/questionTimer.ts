// Shared by the host and Pursuit. Time follows the answering task, including
// typed answers to picture and music questions.
export const TIMER_BY_TYPE: Record<string, number> = {
  multiple_choice: 10,
  sequence: 15,
  multi_tap: 10,
  number: 10,
  text_answer: 20,
  text: 20,
  picture: 20,
  audio: 20,
  nearest_wins: 10,
};

export function getTimerForQuestion(q: { question_type?: string; correct_answer?: string | null } | null | undefined, fallback: number): number {
  if (!q) return fallback;
  // Match the numeric keypad used for legacy text questions with numeric answers.
  if (!["multiple_choice", "sequence", "multi_tap"].includes(q.question_type ?? "") && /^\d+$/.test((q.correct_answer ?? "").trim())) return 10;
  return TIMER_BY_TYPE[q.question_type ?? ""] ?? 20;
}
