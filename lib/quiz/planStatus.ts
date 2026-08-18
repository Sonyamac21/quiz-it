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
type PlanRound = { id: string; round_type: string; questions: unknown[]; name?: string };
type Plan = { quiz_rounds?: PlanRound[] } | null | undefined;

function asQuestion(q: unknown): { question_type?: unknown; option_b?: unknown } {
  return (q ?? {}) as { question_type?: unknown; option_b?: unknown };
}

export function isQuizPlanComplete(quiz: Plan): boolean {
  const rounds = quiz?.quiz_rounds;
  if (!rounds || rounds.length === 0) return false;
  return rounds.every(round => roundMusicIsPrepped(round) && round.questions.length > 0);
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
