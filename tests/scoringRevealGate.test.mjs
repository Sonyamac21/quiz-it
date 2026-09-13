import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const host = readFileSync(new URL("../app/host/quiz/page.tsx", import.meta.url), "utf8");

test("celebration cannot publish before automatic scoring finishes", () => {
  assert.match(host, /scoringInProgressRef\.current = true;[\s\S]*await autoScore\([\s\S]*scoringInProgressRef\.current = false;/);
  assert.match(host, /async function doCelebrate\(\)[\s\S]*if \(scoringInProgressRef\.current\)/);
  assert.match(host, /disabled=\{scoringInProgress\}[\s\S]*Confirming scores/);
});

test("spacebar progression is blocked while scores are being confirmed", () => {
  assert.match(host, /function handleSpacebar\(\)[\s\S]*if \(scoringInProgressRef\.current\)/);
});
