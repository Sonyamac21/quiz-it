import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/quiz/questionGenerationCore.ts", import.meta.url), "utf8");

test("Multi Tap generation forbids obvious category-mismatched decoys", () => {
  assert.match(source, /Every wrong option must be a credible near-miss from the SAME semantic category/);
  assert.match(source, /"Concrete" beside five cheeses is forbidden/);
});

test("final quality control rejects factually false keys and giveaway decoys", () => {
  assert.match(source, /verify every option independently/);
  assert.match(source, /'Concrete' among types of cheese MUST FAIL/);
  assert.match(source, /five obvious correct items and one absurd outsider MUST FAIL/);
});

test("generation enforces explicit name-part wording without rejecting mononyms", () => {
  assert.match(source, /export function partialNameAnswerError/);
  assert.match(source, /Person answers must request the full name, surname, or first name explicitly/);
  assert.match(source, /Madonna/);
  assert.match(source, /partialNameAnswerError\(q\)/);
});
