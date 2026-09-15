import test from "node:test";
import assert from "node:assert/strict";
import { hardDeckGambleStake, hardDeckStealAward } from "../lib/quiz/hardDeck.ts";

test("Hard Deck steal follows the playing team's live gamble", () => {
  assert.equal(hardDeckGambleStake(0), 10, "opening card risks 10");
  assert.equal(hardDeckGambleStake(10), 10);
  assert.equal(hardDeckGambleStake(20), 20);
  assert.equal(hardDeckGambleStake(40), 40);
});

test("correct predictors split the dynamic gamble pool", () => {
  assert.equal(hardDeckStealAward(30, 1), 30);
  assert.equal(hardDeckStealAward(30, 2), 15);
  assert.equal(hardDeckStealAward(30, 3), 10);
  assert.equal(hardDeckStealAward(30, 0), 0);
});
