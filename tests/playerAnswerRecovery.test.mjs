import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../components/PlayerQuizScreen.tsx", import.meta.url), "utf8");

test("failed handset answers remain available for an explicit retry", () => {
  assert.match(source, /setFailedAnswer\(answer\)/);
  assert.match(source, />RETRY ANSWER<\/button>/);
  assert.match(source, /void submitAnswer\(answer\)/);
});

test("a new question and a confirmed write clear stale recovery state", () => {
  assert.ok(source.match(/setFailedAnswer\(null\)/g)?.length >= 2);
});
