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
  assert.match(readFileSync(new URL("../lib/quiz/generatePairs.ts", import.meta.url), "utf8"), /selectMatchingPixabayHit\(candidates, query, label\)/);
});

test("Match Made reuses a verified image instead of re-gambling on the same label forever", () => {
  const source = readFileSync(new URL("../lib/quiz/generatePairs.ts", import.meta.url), "utf8");
  assert.match(source, /lookupCachedImage\(label\)/);
  assert.match(source, /pairs_image_cache/);
  // Only a durably re-hosted image is remembered - a raw Pixabay hotlink
  // fallback is known to go dead over time and must never be cached, or a
  // single transient failure would resurrect a broken image indefinitely.
  assert.match(source, /if \(saved\.persisted\) void cacheVerifiedImage/);
});

test("both generator screens use the shared pool and stronger duplicate threshold", () => {
  const round = readFileSync(new URL("../lib/quiz/generateRound.ts", import.meta.url), "utf8");
  const standalone = readFileSync(new URL("../app/host/questions/page.tsx", import.meta.url), "utf8");
  assert.match(round, /GENERAL_TOPIC_BUCKETS\.map\(shuffle\)/);
  assert.match(standalone, /GENERAL_TOPIC_BUCKETS\.map\(shuffle\)/);
  assert.match(core, /p_threshold: 0\.68/);
});
