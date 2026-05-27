export const SAMPLE_QUESTION_ID = 1;

export const SAMPLE_QUESTION = {
  id: SAMPLE_QUESTION_ID,
  question_text: "Which planet has the most moons?",
  option_a: "Jupiter",
  option_b: "Saturn",
  option_c: "Uranus",
  option_d: "Neptune",
  correct_answer: "b" as const,
  round_number: 1,
  question_number: 1,
} as const;

export type AnswerChoice = "a" | "b" | "c" | "d";

/** Payload sent to player handsets (no correct answer). */
export type QuestionBroadcastPayload = {
  question_id: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  round_number: number;
  question_number: number;
};

export function toPlayerBroadcastPayload(): QuestionBroadcastPayload {
  const q = SAMPLE_QUESTION;
  return {
    question_id: q.id,
    question_text: q.question_text,
    option_a: q.option_a,
    option_b: q.option_b,
    option_c: q.option_c,
    option_d: q.option_d,
    round_number: q.round_number,
    question_number: q.question_number,
  };
}

export function isAnswerCorrect(selected: AnswerChoice): boolean {
  return selected === SAMPLE_QUESTION.correct_answer;
}
