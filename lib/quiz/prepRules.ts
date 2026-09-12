export type QuestionIdentity = { question_text?: unknown; correct_answer?: unknown };

function normalise(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function questionIdentityKey(question: QuestionIdentity): string {
  return `${normalise(question.question_text)}|${normalise(question.correct_answer)}`;
}

export function eligibleLibraryQuestions<T extends QuestionIdentity & { id: string }>(
  pool: T[],
  existingQuestions: QuestionIdentity[],
  rejectedIds: ReadonlySet<string>,
): T[] {
  const existingKeys = new Set(existingQuestions.map(questionIdentityKey));
  return pool.filter(question => !existingKeys.has(questionIdentityKey(question)) && !rejectedIds.has(question.id));
}

export function resolveRoundGenerationSettings(
  round: { theme?: string | null; difficulty?: string | null },
  draft?: { theme?: string | null; difficulty?: string | null },
): { theme: string; difficulty: string } {
  return {
    theme: round.theme || draft?.theme || "",
    difficulty: round.difficulty || draft?.difficulty || "mixed",
  };
}
