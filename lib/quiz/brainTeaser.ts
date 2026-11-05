export function makeFinalBrainTeaser<T extends Record<string, unknown>>(questions: T[], index: number): T[] {
  const chosen = questions[index];
  if (!chosen || chosen.question_type !== "number") throw new Error("Choose a numeric maths or logic question.");
  const rest = questions.filter((_, i) => i !== index).map(question => {
    const copy = { ...question };
    delete copy.brain_teaser;
    return copy;
  });
  return [...rest, { ...chosen, brain_teaser: true }];
}
