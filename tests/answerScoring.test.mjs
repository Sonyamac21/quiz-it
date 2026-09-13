import test from "node:test";
import assert from "node:assert/strict";
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

test("A5/A6: a retried answer resolves to exactly one latest authoritative row", () => {
  const answers = [
    { team_name: " Jazz ", answer_text: "1", submitted_at: "2026-09-09T10:00:01.000Z" },
    { team_name: "jazz", answer_text: "2", submitted_at: "2026-09-09T10:00:02.000Z" },
    { team_name: "Mac", answer_text: "3", submitted_at: "2026-09-09T10:00:03.000Z" },
  ];
  assert.equal(latestAnswerForTeam(answers, "JAZZ")?.answer_text, "2");
  assert.equal(rankNearestWins(answers, { ...baseQuestion, question_type: "nearest_wins", correct_answer: "2" }).length, 2);
});
