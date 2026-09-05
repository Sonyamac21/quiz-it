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

export function normaliseAnswerText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/^(the|a|an) /i, "").trim();
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
  // Numbers must match exactly - no fuzzy/typo tolerance, a wrong digit is just wrong
  if (q && q.question_type === "number") {
    return answer.trim() === correct.trim();
  }
  const a = normaliseAnswerText(answer);
  const b = normaliseAnswerText(correct);
  if (a === b) return true;
  if (a === "" || b === "") return false;
  // Partial match: answer is contained in correct or vice versa - require a meaningful fraction, not just 3+ chars, to avoid false positives like "her" matching inside "Cher"
  if (b.includes(a) && a.length >= 4 && a.length >= b.length * 0.6) return true;
  if (a.includes(b) && b.length >= 4 && b.length >= a.length * 0.6) return true;
  // Check each word of correct answer against answer
  const bWords = b.split(" ");
  if (bWords.length > 1) {
    for (const word of bWords) {
      if (word.length >= 4 && a === word) return true;
    }
  }
  const maxDist = Math.max(1, Math.floor(b.length * 0.3));
  return levenshteinDistance(a, b) <= maxDist;
}

export function getCorrectAnswerText(q: ScorableQuestion): string {
  if (q.question_type === "multiple_choice") {
    const map: Record<string, string | null | undefined> = { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d, e: q.option_e, f: q.option_f };
    const storedKey = q.correct_answer.trim().toLowerCase().match(/^[a-f](?=$|[.):\s-])/)?.[0] || q.correct_answer.toLowerCase();
    return map[storedKey] || q.correct_answer;
  }
  if (q.question_type === "sequence") {
    const map: Record<string, string | null> = { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d };
    const order = q.correct_answer.split(",").map(s => s.trim().toLowerCase());
    const texts = order.map(key => map[key]).filter((t): t is string => !!t);
    if (texts.length === order.length) return texts.join(", ");
    return q.correct_answer;
  }
  if (q.question_type === "multi_tap") {
    const map: Record<string, string | null | undefined> = { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d, e: q.option_e, f: q.option_f };
    const keys = q.correct_answer.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const texts = keys.map(key => map[key]).filter((t): t is string => !!t);
    if (texts.length === keys.length) return texts.join(", ");
    return q.correct_answer;
  }
  return q.correct_answer;
}

export function isAnswerCorrect(ans: ScorableAnswer, q: ScorableQuestion): boolean {
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
    const correctKeys = (q.correct_answer || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const tappedKeys = (ans.answer_text || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const correctTaps = tappedKeys.filter(k => correctKeys.includes(k));
    const wrongTaps = tappedKeys.filter(k => !correctKeys.includes(k));
    // Exact match required both ways: every correct key tapped, AND no extra wrong taps.
    return correctTaps.length === correctKeys.length && wrongTaps.length === 0 && correctKeys.length > 0;
  }
  // Sequence: order is the whole point, so compare position-by-position, not
  // as one fuzzy-matched blob (a team that tapped every item right but in the
  // wrong order must not read as correct).
  if (q.question_type === "sequence") {
    const map: Record<string, string | null> = { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d };
    const order = (q.correct_answer || "").split(",").map(s => s.trim().toLowerCase());
    const correctItems = order.map(key => map[key]).filter((t): t is string => !!t);
    if (correctItems.length === 0 || correctItems.length !== order.length) return false;
    const submittedItems = (ans.answer_text || "").split(",").map(s => s.trim());
    if (submittedItems.length !== correctItems.length) return false;
    return correctItems.every((item, i) => normaliseAnswerText(item) === normaliseAnswerText(submittedItems[i] || ""));
  }
  return isFuzzyMatch(ans.answer_text, getCorrectAnswerText(q), q);
}
