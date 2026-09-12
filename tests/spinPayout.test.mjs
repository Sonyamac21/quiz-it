import test from "node:test";
import assert from "node:assert/strict";

import { calculateSpinPayout } from "../lib/quiz/spinPayout.ts";

const scores = [
  { team_name: "Alpha", total_points: 100 },
  { team_name: "Bravo", total_points: 80 },
  { team_name: "Charlie", total_points: 60 },
  { team_name: "Delta", total_points: 40 },
  { team_name: "Spinner", total_points: 25 },
];

test("numeric spin outcomes add and subtract their displayed value", () => {
  assert.equal(calculateSpinPayout(scores, "Spinner", "+50 Points"), 75);
  assert.equal(calculateSpinPayout(scores, "Spinner", "-10 Points"), 15);
  assert.equal(calculateSpinPayout(scores, "Spinner", "-20 Points"), 5);
  assert.equal(calculateSpinPayout(scores, "Spinner", "-30 Points"), 0);
});

test("negative spin outcomes are floored at zero", () => {
  assert.equal(calculateSpinPayout([{ team_name: "Spinner", total_points: 8 }], "Spinner", "-30 Points"), 0);
});

test("placement outcomes target the requested leaderboard position", () => {
  assert.equal(calculateSpinPayout(scores, "Spinner", "1st Place"), 101);
  assert.equal(calculateSpinPayout(scores, "Spinner", "2nd Place"), 81);
  assert.equal(calculateSpinPayout(scores, "Spinner", "3rd Place"), 61);
  assert.equal(calculateSpinPayout(scores, "Spinner", "Last Place"), 39);
});

test("placement calculation remains correct with 50 teams", () => {
  const fifty = Array.from({ length: 50 }, (_, index) => ({
    team_name: index === 49 ? "Spinner" : `Team ${index + 1}`,
    total_points: 500 - index * 5,
  }));
  assert.equal(calculateSpinPayout(fifty, "Spinner", "1st Place"), 501);
  assert.equal(calculateSpinPayout(fifty, "Spinner", "2nd Place"), 496);
  assert.equal(calculateSpinPayout(fifty, "Spinner", "3rd Place"), 491);
  assert.equal(calculateSpinPayout(fifty, "Spinner", "Last Place"), 259);
});

test("a missing team is rejected instead of inventing a zero score", () => {
  assert.equal(calculateSpinPayout(scores, "Missing", "+50 Points"), null);
});
