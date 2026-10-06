import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const core = readFileSync(new URL("../lib/quiz/questionGenerationCore.ts", import.meta.url), "utf8");

test("malformed model prose cannot impersonate a fatal quota error", () => {
  assert.doesNotMatch(core, /JSON parse failed\. Raw text/);
  assert.match(core, /The AI returned commentary instead of valid question data/);
  assert.match(core, /exactly one web search available/);
  assert.match(core, /Never substitute unverified current facts/);
});

test("mixed generation has broad geography, sport and recent-news coverage", () => {
  assert.match(core, /export const GENERAL_TOPIC_BUCKETS/);
  assert.match(core, /world capitals beyond the most commonly asked examples/);
  assert.match(core, /rivers, lakes, mountains and natural wonders/);
  assert.match(core, /Formula 1, cricket or rugby/);
  assert.match(core, /last 1-3 months/);
  assert.match(core, /breaking celebrity and showbiz news/);
  assert.match(core, /Asia, Africa or Middle East angle/);
});

test("pairs image matching prefers, but does not require, the visible label in Pixabay tags", () => {
  // A hard requirement here used to zero out every candidate silently
  // whenever Pixabay's own tagging didn't happen to include the literal
  // label word (see generatePairs.ts's own comment on the "raincoat" live
  // failure) - it's a ranking preference now, not an exclusionary filter.
  const match = readFileSync(new URL("../lib/quiz/pixabayMatch.ts", import.meta.url), "utf8");
  assert.match(match, /requiredLabel\?: string/);
  assert.match(match, /requiredLabelTerms/);
  assert.doesNotMatch(match, /filter\(result => !requiredLabelTerms\.length \|\| result\.labelMatches > 0\)/);
});

test("Match Made generates words without photo searches or paid vision checks", () => {
  const source = readFileSync(new URL("../lib/quiz/generatePairs.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /sourceImage|checkPictureIdentity|pixabay|persistPixabayImage/);
  assert.match(source, /distinct WORD pairs/);
});

test("both generator screens use the shared pool and stronger duplicate threshold", () => {
  const round = readFileSync(new URL("../lib/quiz/generateRound.ts", import.meta.url), "utf8");
  const standalone = readFileSync(new URL("../app/host/questions/page.tsx", import.meta.url), "utf8");
  assert.match(round, /GENERAL_TOPIC_BUCKETS\.map\(shuffle\)/);
  assert.match(standalone, /GENERAL_TOPIC_BUCKETS\.map\(shuffle\)/);
  assert.match(core, /p_threshold: 0\.68/);
});
