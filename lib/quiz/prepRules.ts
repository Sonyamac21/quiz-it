export type QuestionIdentity = { question_text?: unknown; correct_answer?: unknown };

export type LibraryUsage = { times_used?: number | null; created_at?: string | null };

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

/**
 * Keep fresh questions at the top of the host's manual picker. Previously
 * used questions remain available for deliberate reuse, but sit below every
 * unused question. Within each group, retain the useful newest-first order.
 */
export function sortLibraryQuestionsByUsage<T extends LibraryUsage>(questions: T[]): T[] {
  return [...questions].sort((a, b) => {
    const aUsed = Math.max(0, Number(a.times_used) || 0);
    const bUsed = Math.max(0, Number(b.times_used) || 0);
    if ((aUsed > 0) !== (bUsed > 0)) return aUsed > 0 ? 1 : -1;
    const byDate = Date.parse(b.created_at || "") - Date.parse(a.created_at || "");
    return Number.isFinite(byDate) ? byDate : 0;
  });
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
