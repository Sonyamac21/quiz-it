import test from "node:test";
import assert from "node:assert/strict";
import { speedBonusForRank } from "../lib/quiz/speedBonus.ts";

test("ordinary rounds retain the capped sliding speed bonus", () => {
  assert.deepEqual([0, 1, 2, 3].map(rank => speedBonusForRank(rank, 2, false, "sliding_all")), [2, 1, 0, 0]);
});

test("final winner-only mode rewards exactly one correct team", () => {
  assert.deepEqual([0, 1, 2].map(rank => speedBonusForRank(rank, 5, true, "winner_only")), [5, 0, 0]);
});

test("final all-correct mode gives every correct team a descending bonus with a one-point floor", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 20].map(rank => speedBonusForRank(rank, 4, true, "sliding_all")), [4, 3, 2, 1, 1, 1, 1]);
});
