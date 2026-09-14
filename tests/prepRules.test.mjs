import test from "node:test";
import assert from "node:assert/strict";

import { eligibleLibraryQuestions, resolveRoundGenerationSettings, sortLibraryQuestionsByUsage } from "../lib/quiz/prepRules.ts";

test("A7: regeneration retains the round's saved theme and difficulty", () => {
  assert.deepEqual(
    resolveRoundGenerationSettings(
      { theme: "Food & Drink", difficulty: "hard" },
      { theme: "", difficulty: "mixed" },
    ),
    { theme: "Food & Drink", difficulty: "hard" },
  );
});

test("A7: an unsaved draft still supplies settings when the round has none", () => {
  assert.deepEqual(
    resolveRoundGenerationSettings(
      { theme: null, difficulty: null },
      { theme: "Kids Movies", difficulty: "easy" },
    ),
    { theme: "Kids Movies", difficulty: "easy" },
  );
});

test("A8: a question already in a round cannot be selected from the library again", () => {
  const existing = [{ question_text: "Who sang Respect?", correct_answer: "Aretha Franklin" }];
  const pool = [
    { id: "same", question_text: "Who sang Respect?", correct_answer: "Aretha Franklin" },
    { id: "new", question_text: "Who sang Jolene?", correct_answer: "Dolly Parton" },
  ];
  assert.deepEqual(eligibleLibraryQuestions(pool, existing, new Set()).map(question => question.id), ["new"]);
});

test("A9: a rejected library question stays excluded from later pulls for that round", () => {
  const pool = [
    { id: "rejected", question_text: "Rejected question", correct_answer: "No" },
    { id: "available", question_text: "Available question", correct_answer: "Yes" },
  ];
  assert.deepEqual(eligibleLibraryQuestions(pool, [], new Set(["rejected"])).map(question => question.id), ["available"]);
});

test("used library questions move below all unused questions in the picker", () => {
  const questions = [
    { id: "used-new", times_used: 1, created_at: "2026-09-14T09:00:00Z" },
    { id: "unused-old", times_used: 0, created_at: "2026-09-10T09:00:00Z" },
    { id: "used-old", times_used: 3, created_at: "2026-09-01T09:00:00Z" },
    { id: "unused-new", times_used: null, created_at: "2026-09-13T09:00:00Z" },
  ];
  assert.deepEqual(
    sortLibraryQuestionsByUsage(questions).map(question => question.id),
    ["unused-new", "unused-old", "used-new", "used-old"],
  );
});
