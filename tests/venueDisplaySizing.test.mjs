import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const display = readFileSync(new URL("../app/host/display/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("venue prize scene includes the uploaded venue logo", () => {
  const prizes = display.slice(display.indexOf('currentReelScene === "prizes"'), display.indexOf('currentReelScene === "social"'));
  assert.match(prizes, /venueLogoUrl/);
  assert.match(prizes, /lb-reel-brand-logo/);
});

test("widescreen venue stage uses the TV area without laptop-sized caps", () => {
  assert.match(css, /\.lb-reel-brand-panel \{ width:min\(94%,1200px\); height:min\(82vh,760px\); \}/);
  assert.match(css, /\.lb-reel-brand-logo \{ max-width:min\(42%,360px\); max-height:min\(30vh,280px\)/);
  assert.match(css, /grid-template-columns:minmax\(300px,\.22fr\) minmax\(0,\.78fr\)/);
});

test("live question display keeps only the timer at the top right", () => {
  const liveQuestion = display.slice(display.indexOf("// STANDARD QUESTION"), display.indexOf("// No phase/scene matched"));
  assert.match(liveQuestion, /qi-display-picture-timer/);
  assert.doesNotMatch(liveQuestion, /SPEED BONUS/);
  assert.doesNotMatch(liveQuestion, /ANSWERS LOCKED/);
  assert.doesNotMatch(liveQuestion, /qd-meter/);
});
