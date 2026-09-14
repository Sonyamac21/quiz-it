import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const core = readFileSync(new URL("../lib/quiz/questionGenerationCore.ts", import.meta.url), "utf8");

test("mixed generation has broad geography, sport and recent-news coverage", () => {
  assert.match(core, /export const GENERAL_TOPIC_BUCKETS/);
  assert.match(core, /world capitals beyond the most commonly asked examples/);
  assert.match(core, /rivers, lakes, mountains and natural wonders/);
  assert.match(core, /Formula 1, cricket or rugby/);
  assert.match(core, /last 1-3 months/);
  assert.match(core, /breaking celebrity and showbiz news/);
  assert.match(core, /Asia, Africa or Middle East angle/);
});

test("both generator screens use the shared pool and stronger duplicate threshold", () => {
  const round = readFileSync(new URL("../lib/quiz/generateRound.ts", import.meta.url), "utf8");
  const standalone = readFileSync(new URL("../app/host/questions/page.tsx", import.meta.url), "utf8");
  assert.match(round, /GENERAL_TOPIC_BUCKETS\.map\(shuffle\)/);
  assert.match(standalone, /GENERAL_TOPIC_BUCKETS\.map\(shuffle\)/);
  assert.match(core, /p_threshold: 0\.68/);
});
