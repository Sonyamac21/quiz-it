import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const host = readFileSync(new URL("../app/host/quiz/page.tsx", import.meta.url), "utf8");
const display = readFileSync(new URL("../app/host/display/page.tsx", import.meta.url), "utf8");
const player = readFileSync(new URL("../components/PlayerQuizScreen.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const pursuitBoard = readFileSync(new URL("../components/PursuitBoard.tsx", import.meta.url), "utf8");
const pursuitPanel = readFileSync(new URL("../components/PursuitPanel.tsx", import.meta.url), "utf8");

test("host and handset use measured fitting for complete question text", () => {
  assert.match(host, /FitBlockText as="h1" className="qi-mc-question__title"/);
  assert.match(host, /FitBlockText className="qi-mc-answer-key__answer"/);
  assert.match(player, /FitBlockText className="qi-player-question-text"/);
  assert.match(css, /\.qi-mc-desk:has\(\.qi-mc-question\) \{ overflow:hidden; \}/);
  assert.match(css, /\.qi-player-question-scroll \{ overflow:hidden;/);
  assert.match(css, /\.qi-mc-answer-key__explanation[^{]*\{[^}]*-webkit-line-clamp:2/);
  assert.match(css, /\.qi-player-sequence__option\s*>\s*:last-child[^{]*\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /@media \(max-width: 1360px\)[\s\S]*?\.qi-mc-nav \{ grid-column: 1 \/ -1;/);
});

test("Pursuit shares the standard timer treatment and host questions keep a bounded workspace", () => {
  assert.match(pursuitBoard, /qi-display-picture-timer pu-timer/);
  assert.match(css, /\.pursuit-board \.pu-timer\s*\{[^}]*position:absolute/s);
  assert.match(pursuitPanel, /FitBlockText as="h1" className="qi-mc-question__title"/);
  // Host-reported bug: the running-track graphic used to be embedded in the
  // host console too, inside a small fixed-height card (.qi-pursuit-host-
  // board, capped ~280px) that clipped lanes once there were more than a
  // handful of teams, even though every team's data was present. The host's
  // explicit ask was "all I need are the questions and team scores really" -
  // both already exist elsewhere in this console - so the embed and its
  // now-dead CSS were removed rather than trying to shrink it further; the
  // full board remains untouched on the Display screen. Lock in that it
  // stays gone from the host panel/CSS, and that PursuitBoard is no longer
  // imported there.
  assert.doesNotMatch(pursuitPanel, /className="qi-pursuit-host-board"/);
  assert.doesNotMatch(pursuitPanel, /import \{ PursuitBoard \}/);
  assert.doesNotMatch(css, /\.qi-pursuit-host-board\s*\{/);
  assert.match(css, /\.qi-mc-option\s*\{[^}]*min-height:clamp\(/s);
});

test("Pursuit's Display board scales its live-race grid to fit large team counts (up to 60) without scrolling", () => {
  // The venue TV is the one screen that must show every team's runner and
  // the question at once, however many teams are playing - "on the display
  // screen I do need to see all of the teams running and the question -
  // make it fit! even if 50 teams". PELOTON is the top tier (up to 60
  // teams, 2 columns) and computePursuitLayout must still resolve a real
  // layout beyond that rather than crashing/returning undefined; the board
  // additionally shrinks lane height further at render time if the actual
  // measured grid height is still too short (see heightShrink in
  // PursuitBoard.tsx), so this is a genuine no-scroll guarantee, not just a
  // tier lookup.
  const pursuit = readFileSync(new URL("../lib/quiz/pursuit.ts", import.meta.url), "utf8");
  assert.match(pursuit, /maxTeams:\s*60,\s*layout:\s*\{\s*label:\s*"PELOTON"/);
  assert.match(pursuitBoard, /heightShrink/);
  assert.match(css, /\.pursuit-board\s*\{[^}]*height:\s*100dvh/s);
});

test("TV question, picture and reveal copy all remain inside fixed stages", () => {
  assert.match(display, /FitQuestionText className="qd-q"/);
  assert.match(display, /FitBlockText className="qi-display-picture-question-text"/);
  assert.match(display, /FitBlockText className="qi-display-answer-question"/);
  assert.match(display, /FitBlockText className="qi-display-answer-hero-text"/);
  assert.match(css, /\.qi-display-answer-explanation[^{]*\{[^}]*-webkit-line-clamp:3/);
  assert.match(display, /className="qi-display-fullscreen-top"/);
  assert.match(css, /\.qi-display-fullscreen-top\s*\{[^}]*top:/s, "fullscreen control stays away from the bottom-right brand signature");
});

test("Hot Seat and celebration copy shrink to fit instead of being clipped", () => {
  const hotSeat = readFileSync(new URL("../components/HotSeatDisplay.tsx", import.meta.url), "utf8");
  assert.match(display, /<HotSeatDisplay question=/);
  assert.match(hotSeat, /FitBlockText as="h1" maxViewportHeight=\{0\.3\} minFontSize=\{26\}/);
  assert.match(hotSeat, /FitBlockText className="qi-display-hot-seat__team"/);
  assert.match(css, /\.qi-display-hot-seat__timer\s*\{[^}]*position:absolute;[^}]*top:16px;[^}]*right:/);
  assert.match(display, /FitBlockText className="qi-display-fastest-team"/);
  assert.match(player, /FitBlockText className="qi-player-hot-seat__question"/);
  assert.match(player, /FitBlockText className="qi-player-celebration-team"/);
  assert.match(host, /FitBlockText className="qi-mc-celebration__answer"/);
  assert.match(host, /FitBlockText className="qi-mc-celebration__team"/);
});

test("TV reveal and celebration use readable standard branding", () => {
  assert.match(display, /className="qi-display-answer-brand"><BrandMark size="xs" align="center" \/>/);
  assert.match(css, /\.qi-display-answer-brand[^}]*font:750 clamp\(13px/);
  assert.doesNotMatch(display, /fontSize:8, color:"rgba\(255,255,255,0\.14\)"/);
});

test("every round opens with a fitted host rules briefing", () => {
  assert.match(host, /hostPhase === "round_start"[\s\S]*?className="qi-mc-round-start"/);
  assert.match(host, /rules\[selectedRound\.round_type\][\s\S]*?\|\| rules\.regular\)\.map/);
  assert.match(host, /bonus:\s*\[/);
  assert.match(css, /\.qi-mc-round-start\s*\{[^}]*height:100%[^}]*overflow:hidden/s);
  assert.match(css, /\.qi-mc-round-start__rules li[^}]*font-size:clamp\(/);
});
