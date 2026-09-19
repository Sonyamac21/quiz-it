import test from "node:test";
import assert from "node:assert/strict";

import { calculateSpinPayout } from "../lib/quiz/spinPayout.ts";
import { scoreBarPercent } from "../lib/quiz/scoreBar.ts";

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
  assert.equal(calculateSpinPayout(scores, "Spinner", "-30 Points"), -5);
});

test("deductions cross zero and continue below zero", () => {
  assert.equal(calculateSpinPayout([{ team_name: "Spinner", total_points: 5 }], "Spinner", "-20 Points"), -15);
  assert.equal(calculateSpinPayout([{ team_name: "Spinner", total_points: -8 }], "Spinner", "-30 Points"), -38);
  assert.equal(calculateSpinPayout([{ team_name: "Spinner", total_points: 0 }], "Spinner", "-10 Points"), -10);
});

test("placement and bars remain ordered with negative scores", () => {
  const board = [{ team_name: "A", total_points: -5 }, { team_name: "B", total_points: -20 }, { team_name: "Spinner", total_points: -30 }];
  assert.equal(calculateSpinPayout(board, "Spinner", "Last Place"), -21);
  assert.equal(calculateSpinPayout(board, "Spinner", "3rd Place"), -21);
  assert.equal(calculateSpinPayout(board.slice(1), "Spinner", "2nd Place"), -21);
  for (const totals of [[-5, -20, -30], [20, 0, -30], [0, 0, 0], [-5, -5, -5]]) {
    const widths = totals.map(score => scoreBarPercent(score, totals[0], totals.at(-1)));
    assert.ok(widths.every(w => w >= 4 && w <= 100));
    assert.ok(widths[0] >= widths[1] && widths[1] >= widths[2]);
  }
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
