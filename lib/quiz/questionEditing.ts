export function editAnswerKey(type: string, current: string, letter: string): string {
  if (type === "sequence") return current;
  if (type !== "multi_tap") return letter;
  const selected = new Set(current.toLowerCase().split(",").map(value => value.trim()).filter(Boolean));
  if (selected.has(letter)) selected.delete(letter); else selected.add(letter);
  return [...selected].sort().join(",");
}

type Question = Record<string, unknown>;
export async function saveRoundQuestionEdit(original: Question, updated: Question, read: () => Promise<Question[]>, write: (before: Question[], after: Question[]) => Promise<boolean>): Promise<Question[]> {
  const patch = Object.fromEntries(Object.entries(updated).filter(([key, value]) => value !== original[key]));
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await read();
    const index = before.findIndex(question => original._uid ? question._uid === original._uid
      : question.question_text === original.question_text && question.correct_answer === original.correct_answer && question.question_type === original.question_type);
    if (index < 0 || before[index].question_type !== original.question_type) throw new Error("This question changed elsewhere. Reopen it before saving.");
    const after = before.map((question, i) => i === index ? { ...question, ...patch } : question);
    if (await write(before, after)) return after;
  }
  throw new Error("The round changed while saving. Your edit is still open; please try again.");
}
