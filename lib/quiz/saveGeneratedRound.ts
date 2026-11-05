type Question = Record<string, unknown>;
export type SavedRound = { questions: Question[]; target_count: number | null };
const identity = (q: Question) => q._uid ? `uid:${q._uid}` : q.question_text
  ? `${String(q.question_text).trim().toLowerCase()}|${String(q.correct_answer).trim().toLowerCase()}`
  : JSON.stringify(q.pairs || q);

export async function saveGeneratedRound(incoming: Question[], read: () => Promise<SavedRound>,
  write: (before: SavedRound, after: SavedRound) => Promise<boolean>, growTarget = false, fallbackTarget = 0) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await read();
    const seen = new Set(before.questions.map(identity));
    const additions = incoming.filter(question => {
      const key = identity(question);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    const questions = [...before.questions, ...additions];
    // Adding questions must not push an existing finale out of last place.
    const final = questions.findLastIndex(question => question.brain_teaser === true);
    if (final >= 0) {
      const teaser = questions.splice(final, 1)[0];
      const cleaned = questions.map(question => {
        if (!question.brain_teaser) return question;
        const copy = { ...question }; delete copy.brain_teaser; return copy;
      });
      questions.splice(0, questions.length, ...cleaned, teaser);
    }
    const after = { questions, target_count: growTarget && additions.length ? Math.max(before.target_count || fallbackTarget, questions.length) : before.target_count };
    if (await write(before, after)) return { ...after, added: additions.length };
  }
  throw new Error("The round changed while saving. Your generated questions were not allowed to overwrite another edit. Please try again.");
}
