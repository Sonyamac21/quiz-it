// Single source of truth for "did this team get the question right" and "what
// is the correct answer text", shared between the host scoring screen
// (app/host/quiz/page.tsx - autoScore/doCelebrate) and the player handset
// (components/PlayerQuizScreen.tsx - the answer-reveal screen).
//
// Codex #12: previously the player handset only showed an authoritative
// CORRECT/INCORRECT verdict for multiple_choice (comparing the picked letter
// key to the correct key - the exact same thing scoring compares, so it could
// never disagree). Every other type (text/number/sequence/multi_tap/
// picture/audio) just showed the correct answer text next to "Your answer:
// ..." and made the player work out for themselves whether they'd got it
// right. Extracting the real scoring logic here lets the handset render the
// same verdict autoScore actually used to award points, for every type, with
// no risk of the two disagreeing (they're now literally the same function).

export type ScorableQuestion = {
  question_text?: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  option_e?: string | null;
  option_f?: string | null;
  correct_answer: string;
};

export type ScorableAnswer = {
  answer_text: string;
};

export type MultiTapScore = {
  basePoints: number;
  timeBonusPoints: number;
  totalPoints: number;
  correctJudgements: number;
};

export type TimestampedTeamAnswer = ScorableAnswer & {
  team_name: string;
  submitted_at: string;
};

export type NearestWinsEntry = {
  teamName: string;
  distance: number;
  submittedAt: number;
};

const OPTION_KEYS = ["a", "b", "c", "d", "e", "f"] as const;

function answerKeys(value: string): string[] {
  return [...new Set(value.split(",").map(key => key.trim().toLowerCase()).filter(Boolean))];
}

function parseSequenceItems(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.every(item => typeof item === "string")) return parsed.map(item => item.trim());
    } catch { /* legacy answers fall through to comma parsing */ }
  }
  return trimmed.split(",").map(item => item.trim()).filter(Boolean);
}

/** Resolve current key-based and legacy text-based stored sequence answers. */
export function sequenceCorrectItems(q: ScorableQuestion): string[] {
  const options = [q.option_a, q.option_b, q.option_c, q.option_d].filter((item): item is string => Boolean(item));
  const raw = parseSequenceItems(q.correct_answer || "");
  if (raw.length === options.length && raw.every(item => /^[a-d]$/i.test(item))) {
    const map: Record<string, string | null> = { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d };
    return raw.map(key => map[key.toLowerCase()]).filter((item): item is string => Boolean(item));
  }
  if (raw.length === options.length) return raw;
  // Recover legacy text answers when an option itself contains a comma.
  const stored = normaliseAnswerText(q.correct_answer || "");
  const located = options.map(item => ({ item, at: stored.indexOf(normaliseAnswerText(item)) }));
  if (located.every(entry => entry.at >= 0)) return located.sort((a, b) => a.at - b.at).map(entry => entry.item);
  return [];
}

export function normaliseTeamName(value: string): string {
  return value.trim().toLowerCase();
}

/** Resolve network retries consistently: the newest row is authoritative. */
export function latestAnswerForTeam<T extends TimestampedTeamAnswer>(answers: T[], teamName: string): T | undefined {
  const target = normaliseTeamName(teamName);
  return answers
    .filter(answer => normaliseTeamName(answer.team_name) === target)
    .reduce<T | undefined>((latest, answer) => {
      if (!latest) return answer;
      return Date.parse(answer.submitted_at) > Date.parse(latest.submitted_at) ? answer : latest;
    }, undefined);
}

export function rankNearestWins<T extends TimestampedTeamAnswer>(
  answers: T[],
  question: ScorableQuestion,
): NearestWinsEntry[] {
  const latestByTeam = new Map<string, T>();
  for (const answer of answers) {
    const key = normaliseTeamName(answer.team_name);
    const current = latestByTeam.get(key);
    if (!current || Date.parse(answer.submitted_at) > Date.parse(current.submitted_at)) latestByTeam.set(key, answer);
  }
  return [...latestByTeam.values()]
    .map(answer => {
      const distance = nearestWinsDistance(answer, question);
      return distance === null ? null : {
        teamName: answer.team_name,
        distance,
        submittedAt: Date.parse(answer.submitted_at),
      };
    })
    .filter((entry): entry is NearestWinsEntry => entry !== null)
    .sort((a, b) => a.distance - b.distance || a.submittedAt - b.submittedAt);
}

/** Multi Tap awards for every correctly judged option, not only exact matches. */
export function calculateMultiTapScore(
  answer: ScorableAnswer,
  question: ScorableQuestion,
  options: { timeBonus?: number; boosted?: boolean; wipedOut?: boolean } = {},
): MultiTapScore {
  if (question.question_type !== "multi_tap") {
    return { basePoints: 0, timeBonusPoints: 0, totalPoints: 0, correctJudgements: 0 };
  }
  const correctKeys = answerKeys(question.correct_answer);
  const tappedKeys = answerKeys(answer.answer_text);
  const availableKeys = OPTION_KEYS.filter(key => Boolean(question[`option_${key}`]));
  const correctJudgements = availableKeys.filter(key =>
    correctKeys.includes(key) === tappedKeys.includes(key)
  ).length;
  const wipedOut = options.wipedOut ?? false;
  const basePoints = wipedOut ? 0 : correctJudgements * 2;
  const timeBonusPoints = wipedOut ? 0 : Math.max(0, options.timeBonus ?? 0);
  return {
    basePoints,
    timeBonusPoints,
    totalPoints: (basePoints + timeBonusPoints) * (options.boosted ? 2 : 1),
    correctJudgements,
  };
}

export function normaliseAnswerText(s: string): string {
  // Live bug: correct_answer "crème brûlée" was reduced to "crme brle" -
  // the accented letters were being DELETED outright by the [^a-z0-9 ]
  // strip below, rather than folded to their plain-letter equivalent, which
  // mangled the correct answer short enough that even a team who typed the
  // fully correct word minus the accents ("CREME BRULEE") no longer scored
  // as a close enough match. Unicode-normalize first (NFD splits "é" into
  // "e" + a separate combining accent mark) and drop only the combining
  // marks, so accented text folds to its plain-ASCII equivalent instead of
  // losing the letter entirely - the same technique already used for
  // Pixabay search terms in lib/quiz/pixabayMatch.ts.
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "").replace(/^(the|a|an) /i, "").trim();
}

/** Recover malformed legacy audio answers that stored internal lookup
 * metadata ("Artist - Title") instead of the one thing the question asks.
 * New generation rejects this shape before saving. */
export function canonicalCorrectAnswer(q: ScorableQuestion): string {
  if (q.question_type !== "audio") return q.correct_answer;
  const parts = q.correct_answer.split(/\s+[-–—]\s+/).map(part => part.trim()).filter(Boolean);
  if (parts.length !== 2) return q.correct_answer;
  const prompt = normaliseAnswerText(q.question_text || "");
  const asksForArtist = /\b(who|artist|band|singer|group|performer|performs|sings|sang)\b/.test(prompt);
  const asksForTitle = /\b(song|track|title|tune|record)\b/.test(prompt);
  // The known legacy generator defect stored Artist - Title, e.g.
  // "Faithless - Music Matters". Do not guess when the wording is ambiguous.
  // Artist wording takes precedence because natural artist questions often
  // still contain “song” or “track” ("Which band performs this song?").
  if (asksForArtist) return parts[0];
  if (asksForTitle) return parts[1];
  return q.correct_answer;
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

export function isFuzzyMatch(answer: string, correct: string, q?: ScorableQuestion): boolean {
  // For multiple choice, also accept the letter key
  if (q && q.question_type === "multiple_choice") {
    const key = answer.trim().toLowerCase();
    if (key === q.correct_answer.toLowerCase()) return true;
  }
  // Numbers must match exactly - no fuzzy/typo tolerance, a wrong digit is just wrong.
  // Gating this purely on question_type === "number" missed questions whose
  // correct_answer is a plain number but were authored/imported/generated as
  // question_type "text" (e.g. "What year was X released?" -> "1996") - those
  // fell through to the Levenshtein fuzzy-match below, where a 4-digit answer
  // is only edit-distance 1 away from being "correct" (floor(4*0.3)=1), so an
  // off-by-one guess like "1997" registered as correct. Detect a purely
  // numeric correct_answer directly (allowing thousands separators, e.g.
  // "6,433") and require exact match whenever that's the case, independent of
  // how the question happens to be labelled.
  const isPlainNumber = (s: string) => /^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(s.trim()) || /^-?\d+(\.\d+)?$/.test(s.trim());
  if (q && q.question_type === "number") {
    return answer.trim() === correct.trim();
  }
  if (isPlainNumber(correct)) {
    const stripCommas = (s: string) => s.trim().replace(/,/g, "");
    return stripCommas(answer) === stripCommas(correct);
  }
  const a = normaliseAnswerText(answer);
  const b = normaliseAnswerText(correct);
  if (a === b) return true;
  if (a === "" || b === "") return false;
  // Partial match: answer is contained in correct or vice versa - require a meaningful fraction, not just 3+ chars, to avoid false positives like "her" matching inside "Cher"
  if (b.includes(a) && a.length >= 4 && a.length >= b.length * 0.6) return true;
  if (a.includes(b) && b.length >= 4 && b.length >= a.length * 0.6) return true;
  // Check each word of correct answer against answer. Live bug: correct_answer
  // "Christ the Redeemer statue, Rio de Janeiro" let a bare "CHRIST" score as
  // correct, because this loop accepted a match against ANY 4+ letter word
  // anywhere in the string - including incidental/descriptive words far from
  // what actually identifies the answer. Capped to short correct answers (a
  // proper noun of at most 3 words, e.g. "The Beatles", "David Bowie") so it
  // can no longer fire against long descriptive answers with appended
  // location/context text, where a single shared word proves nothing.
  const bWords = b.split(" ");
  if (bWords.length > 1 && bWords.length <= 3) {
    for (const word of bWords) {
      if (word.length >= 4 && a === word) return true;
    }
  }
  const maxDist = Math.max(1, Math.floor(b.length * 0.3));
  if (levenshteinDistance(a, b) <= maxDist) return true;
  // Same live bug, other half: teams that typed the FULL correct phrase with
  // a genuine typo ("CHRIST THE REDIEMER", "CRHIST THE REDEEMER" for "Christ
  // the Redeemer statue, Rio de Janeiro") were rejected, because the
  // Levenshtein tolerance above is scaled to the ENTIRE correct_answer
  // length - including trailing descriptive text ("statue, Rio de Janeiro")
  // the answer never needed to reproduce - which dilutes the ratio against a
  // much shorter real attempt. Compare instead against just the leading
  // slice of the correct answer the same length as what was typed, so typo
  // tolerance is judged against what the team actually tried to answer.
  // Gated to reasonably long answers (10+ characters) so this cannot also
  // become another way for a single short word to slip through.
  if (a.length >= 10 && a.length < b.length) {
    const bPrefix = b.slice(0, a.length);
    const prefixMaxDist = Math.max(1, Math.floor(a.length * 0.3));
    if (levenshteinDistance(a, bPrefix) <= prefixMaxDist) return true;
  }
  return false;
}

export function getCorrectAnswerText(q: ScorableQuestion): string {
  if (q.question_type === "multiple_choice") {
    const map: Record<string, string | null | undefined> = { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d, e: q.option_e, f: q.option_f };
    const storedKey = q.correct_answer.trim().toLowerCase().match(/^[a-f](?=$|[.):\s-])/)?.[0] || q.correct_answer.toLowerCase();
    return map[storedKey] || q.correct_answer;
  }
  if (q.question_type === "sequence") {
    const texts = sequenceCorrectItems(q);
    if (texts.length) return texts.join(" → ");
    return q.correct_answer;
  }
  if (q.question_type === "multi_tap") {
    const map: Record<string, string | null | undefined> = { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d, e: q.option_e, f: q.option_f };
    const keys = q.correct_answer.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const texts = keys.map(key => map[key]).filter((t): t is string => !!t);
    if (texts.length === keys.length) return texts.join(", ");
    return q.correct_answer;
  }
  return canonicalCorrectAnswer(q);
}

// Nearest Wins (SpeedQuizzing's closest-guess mechanic) has no single
// right/wrong answer - every numeric guess is judged relative to every other
// team's guess, not against a fixed target in isolation. So "correct" is
// meaningless here; the real ranking-by-distance logic lives in autoScore
// (app/host/quiz/page.tsx), which is the only place with visibility into
// every team's answer at once. Always returning false here keeps this type
// out of the exact-match speed-bonus ranking (correctEntries) that every
// other type uses, and out of the plain green/red reveal coloring - both of
// which assume a binary right/wrong that doesn't apply.
export function nearestWinsDistance(ans: ScorableAnswer, q: ScorableQuestion): number | null {
  const parseQuizNumber = (value: string): number => {
    // Generated Nearest Wins answers often include display-friendly thousands
    // separators and an explanation, e.g. "6,433 days (released...)".
    // parseFloat("6,433") is 6, which previously made a guess of 6 beat 6,200.
    // Remove grouping separators only when they sit between digit groups, then
    // parse the leading number while still allowing units/explanatory copy.
    const normalised = value.trim().replace(/(\d)[,\s](?=\d{3}(?:\D|$))/g, "$1");
    return parseFloat(normalised);
  };
  const guess = parseQuizNumber(ans.answer_text);
  const target = parseQuizNumber(q.correct_answer);
  if (!Number.isFinite(guess) || !Number.isFinite(target)) return null;
  return Math.abs(guess - target);
}

export function isAnswerCorrect(ans: ScorableAnswer, q: ScorableQuestion): boolean {
  if (q.question_type === "nearest_wins") return false;
  if (q.question_type === "multiple_choice") {
    const submitted = ans.answer_text.trim().toLowerCase();
    const stored = q.correct_answer.trim().toLowerCase();
    const options: Record<string, string | null | undefined> = { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d, e: q.option_e, f: q.option_f };
    // Older/imported questions sometimes store the option text (for example
    // "SZA") rather than its letter. Phones always submit the letter.
    const storedKey = stored.match(/^[a-f](?=$|[.):\s-])/)?.[0] || null;
    if (storedKey) return submitted === storedKey || normaliseAnswerText(ans.answer_text) === normaliseAnswerText(options[storedKey] || "");
    const matchingKey = Object.entries(options).find(([, text]) => normaliseAnswerText(text || "") === normaliseAnswerText(q.correct_answer))?.[0];
    return submitted === matchingKey || isFuzzyMatch(ans.answer_text, q.correct_answer);
  }
  if (q.question_type === "multi_tap") {
    const correctKeys = answerKeys(q.correct_answer || "");
    const tappedKeys = answerKeys(ans.answer_text || "");
    const correctTaps = tappedKeys.filter(k => correctKeys.includes(k));
    const wrongTaps = tappedKeys.filter(k => !correctKeys.includes(k));
    // Exact match required both ways: every correct key tapped, AND no extra wrong taps.
    return correctTaps.length === correctKeys.length && wrongTaps.length === 0 && correctKeys.length > 0;
  }
  // Sequence: order is the whole point, so compare position-by-position, not
  // as one fuzzy-matched blob (a team that tapped every item right but in the
  // wrong order must not read as correct).
  if (q.question_type === "sequence") {
    const correctItems = sequenceCorrectItems(q);
    if (correctItems.length === 0) return false;
    const submittedItems = parseSequenceItems(ans.answer_text || "");
    if (submittedItems.length !== correctItems.length) return false;
    // Current handsets submit the ordered option text. Accept an ordered key
    // sequence too so older clients and restored answers are scored identically.
    const submittedKeys = submittedItems.map(item => item.toLowerCase());
    if (submittedKeys.every(item => /^[a-d]$/.test(item))) {
      const map: Record<string, string | null> = { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d };
      const submittedText = submittedKeys.map(key => map[key]);
      return correctItems.every((item, i) => normaliseAnswerText(item) === normaliseAnswerText(submittedText[i] || ""));
    }
    return correctItems.every((item, i) => normaliseAnswerText(item) === normaliseAnswerText(submittedItems[i] || ""));
  }
  return isFuzzyMatch(ans.answer_text, getCorrectAnswerText(q), q);
}
