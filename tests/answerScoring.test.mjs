import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateMultiTapScore, getCorrectAnswerText, isAnswerCorrect, latestAnswerForTeam, rankNearestWins } from "../lib/quiz/answerScoring.ts";

const baseQuestion = {
  question_type: "multiple_choice",
  option_a: "Kendrick Lamar",
  option_b: "SZA",
  option_c: "Doja Cat",
  option_d: "H.E.R.",
  option_e: null,
  option_f: null,
  correct_answer: "b",
};

test("A2: multiple choice accepts either stored key or stored option text", () => {
  assert.equal(isAnswerCorrect({ answer_text: "b" }, baseQuestion), true);
  assert.equal(getCorrectAnswerText(baseQuestion), "SZA");
  assert.equal(isAnswerCorrect({ answer_text: "b" }, { ...baseQuestion, correct_answer: "SZA" }), true);
});

test("legacy audio Artist - Title metadata scores the answer actually requested", () => {
  const malformed = {
    ...baseQuestion,
    question_type: "audio",
    question_text: "Name this dance track.",
    correct_answer: "Faithless - Music Matters",
  };
  assert.equal(getCorrectAnswerText(malformed), "Music Matters");
  assert.equal(isAnswerCorrect({ answer_text: "MUSIC MATTERS" }, malformed), true);
  assert.equal(isAnswerCorrect({ answer_text: "MISIC MATTERS" }, malformed), true);
  assert.equal(isAnswerCorrect({ answer_text: "Faithless" }, malformed), false);

  const artistQuestion = { ...malformed, question_text: "Which band performs this song?" };
  assert.equal(getCorrectAnswerText(artistQuestion), "Faithless");
  assert.equal(isAnswerCorrect({ answer_text: "Faithless" }, artistQuestion), true);
  assert.equal(isAnswerCorrect({ answer_text: "Music Matters" }, artistQuestion), false);
});

test("a text-type question with a numeric correct_answer requires an exact match, no Levenshtein leniency", () => {
  // Live bug: "What year was 'Wannabe' by the Spice Girls released?" was
  // stored as question_type "text" (not "number") with correct_answer
  // "1996". isFuzzyMatch's generic Levenshtein fallback allows edit distance
  // up to floor(length * 0.3), which for a 4-digit answer is 1 - so "1997"
  // (one digit off) was being scored correct. Fix detects a purely numeric
  // correct_answer directly and requires exact match regardless of the
  // question's labelled type.
  const yearQuestion = {
    ...baseQuestion,
    question_type: "text",
    question_text: "What year was 'Wannabe' by the Spice Girls released?",
    correct_answer: "1996",
  };
  assert.equal(isAnswerCorrect({ answer_text: "1996" }, yearQuestion), true);
  assert.equal(isAnswerCorrect({ answer_text: "1997" }, yearQuestion), false);
  assert.equal(isAnswerCorrect({ answer_text: "1995" }, yearQuestion), false);
  assert.equal(isAnswerCorrect({ answer_text: "19996" }, yearQuestion), false);

  // Thousands separators in the stored correct_answer shouldn't break the
  // exact-match requirement or force players to type the comma themselves.
  const bigNumberQuestion = { ...baseQuestion, question_type: "text", correct_answer: "6,433" };
  assert.equal(isAnswerCorrect({ answer_text: "6433" }, bigNumberQuestion), true);
  assert.equal(isAnswerCorrect({ answer_text: "6,433" }, bigNumberQuestion), true);
  assert.equal(isAnswerCorrect({ answer_text: "6434" }, bigNumberQuestion), false);
});

test("A1: sequence comparison uses semantic order after options are randomised", () => {
  const question = {
    ...baseQuestion,
    question_type: "sequence",
    option_a: "Michael Jackson",
    option_b: "Elvis Presley",
    option_c: "The Beatles",
    option_d: "David Bowie",
    correct_answer: "b,c,d,a",
  };
  assert.equal(isAnswerCorrect({ answer_text: "Elvis Presley,The Beatles,David Bowie,Michael Jackson" }, question), true);
  assert.equal(isAnswerCorrect({ answer_text: "Michael Jackson,David Bowie,The Beatles,Elvis Presley" }, question), false);
});

test("Hot Seat sequences accept legacy text answers and JSON handset orders", () => {
  const question = {
    ...baseQuestion,
    question_type: "sequence",
    option_a: "First, with a comma",
    option_b: "Second",
    option_c: "Third",
    option_d: "Fourth",
    correct_answer: "First, with a comma, Second, Third, Fourth",
  };
  assert.equal(isAnswerCorrect({ answer_text: JSON.stringify(["First, with a comma", "Second", "Third", "Fourth"]) }, question), true);
  assert.equal(isAnswerCorrect({ answer_text: JSON.stringify(["Second", "First, with a comma", "Third", "Fourth"]) }, question), false);
});

test("sequence scoring accepts edited answers stored as ordered option text", () => {
  const question = {
    ...baseQuestion,
    question_type: "sequence",
    option_a: "Alpha",
    option_b: "Beta",
    option_c: "Gamma",
    option_d: "Delta",
    correct_answer: "Gamma, Alpha, Delta, Beta",
  };
  assert.equal(isAnswerCorrect({ answer_text: JSON.stringify(["Gamma", "Alpha", "Delta", "Beta"]) }, question), true);
});

test("A3: Multi Tap gives two points for each correctly judged option", () => {
  const question = {
    ...baseQuestion,
    question_type: "multi_tap",
    option_a: "A", option_b: "B", option_c: "C",
    option_d: "D", option_e: "E", option_f: "F",
    correct_answer: "a,c,e",
  };
  assert.deepEqual(calculateMultiTapScore({ answer_text: "a,c" }, question), {
    basePoints: 10,
    timeBonusPoints: 0,
    totalPoints: 10,
    correctJudgements: 5,
  });
});

test("Multi Tap applies time bonus and Boost after base scoring", () => {
  const question = {
    ...baseQuestion,
    question_type: "multi_tap",
    option_a: "A", option_b: "B", option_c: "C",
    option_d: "D", option_e: "E", option_f: "F",
    correct_answer: "a,c,e",
  };
  assert.equal(calculateMultiTapScore({ answer_text: "a,c,e" }, question, { timeBonus: 4, boosted: true }).totalPoints, 32);
});

test("Multi Tap wipeout zeros base points and time bonus", () => {
  const question = {
    ...baseQuestion,
    question_type: "multi_tap",
    option_a: "A", option_b: "B", option_c: "C",
    option_d: "D", option_e: "E", option_f: "F",
    correct_answer: "a,c,e",
  };
  assert.deepEqual(
    calculateMultiTapScore({ answer_text: "a,c,e" }, question, { timeBonus: 4, boosted: true, wipedOut: true }),
    { basePoints: 0, timeBonusPoints: 0, totalPoints: 0, correctJudgements: 6 },
  );
});

test("A4: Nearest Wins breaks equal-distance ties by submission time", () => {
  const question = { ...baseQuestion, question_type: "nearest_wins", correct_answer: "100" };
  const ranked = rankNearestWins([
    { team_name: "Later", answer_text: "110", submitted_at: "2026-09-09T10:00:02.000Z" },
    { team_name: "Earlier", answer_text: "90", submitted_at: "2026-09-09T10:00:01.000Z" },
  ], question);
  assert.deepEqual(ranked.map(entry => entry.teamName), ["Earlier", "Later"]);
});

test("Nearest Wins awards points only to the closest ranked team", () => {
  const host = readFileSync(new URL("../app/host/quiz/page.tsx", import.meta.url), "utf8");
  assert.match(host, /const nwDelta = rank === 0 \? pointsPerQ/);
  assert.doesNotMatch(host, /nwPointShares/);
});

test("Nearest Wins parses a comma-formatted target with explanatory text", () => {
  const question = {
    ...baseQuestion,
    question_type: "nearest_wins",
    correct_answer: "6,433 days (Diet Pepsi was released first)",
  };
  const ranked = rankNearestWins([
    { team_name: "Halls of Mika", answer_text: "6", submitted_at: "2026-09-13T08:00:01.000Z" },
    { team_name: "Mama", answer_text: "6200", submitted_at: "2026-09-13T08:00:02.000Z" },
    { team_name: "Jazmyn", answer_text: "741", submitted_at: "2026-09-13T08:00:03.000Z" },
  ], question);
  assert.deepEqual(ranked.map(entry => entry.teamName), ["Mama", "Jazmyn", "Halls of Mika"]);
  assert.deepEqual(ranked.map(entry => entry.distance), [233, 5692, 6427]);
});

test("A5/A6: a retried answer resolves to exactly one latest authoritative row", () => {
  const answers = [
    { team_name: " Jazz ", answer_text: "1", submitted_at: "2026-09-09T10:00:01.000Z" },
    { team_name: "jazz", answer_text: "2", submitted_at: "2026-09-09T10:00:02.000Z" },
    { team_name: "Mac", answer_text: "3", submitted_at: "2026-09-09T10:00:03.000Z" },
  ];
  assert.equal(latestAnswerForTeam(answers, "JAZZ")?.answer_text, "2");
  assert.equal(rankNearestWins(answers, { ...baseQuestion, question_type: "nearest_wins", correct_answer: "2" }).length, 2);
});
