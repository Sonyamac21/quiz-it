import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/host/quizzes/page.tsx", import.meta.url), "utf8");

// Host, live: "I cannot move to library - when I hover over it, it extends
// and the button is off the bottom of the screen, I cannot scroll as there
// is no extended 'off screen' question." The card's action row used to
// relocate into an absolutely-positioned hover popover (`.qi-prep-question-
// preview`) whose height was capped against the whole viewport rather than
// the space actually left below the card, so on any card not near the top
// the buttons could render past the visible viewport with no page scroll to
// reach them - and hovering the card AT ALL (including hovering the button
// itself) is what triggered the relocation, so moving toward TO LIBRARY to
// click it was exactly what pushed it out of reach. The actions now stay in
// normal document flow always, never relocated by hover.
test("round-prep question card actions stay in normal flow, never relocated by hover", () => {
  assert.doesNotMatch(page, /qi-prep-question-preview/);
  assert.doesNotMatch(page, /isCardHovered/);
  assert.doesNotMatch(page, /hoveredQuestionKey/);
  assert.match(page, /const questionActions = \([\s\S]*>EDIT<\/HostButton>[\s\S]*"REGEN"/);
  assert.match(page, /<div style=\{\{ flex: 1, overflow: "hidden" \}\}>\{cardBody\}<\/div>\s*\{questionActions\}/);
  assert.match(page, />TO LIBRARY<\/HostButton>/);
  assert.match(page, /moveQuestionToLibrary\(activeRound, qi\)/);
});
