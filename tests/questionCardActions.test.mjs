import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/host/quizzes/page.tsx", import.meta.url), "utf8");

// Host, live, twice on this same feature:
// (1) "I cannot move to library - when I hover over it, it extends and the
//     button is off the bottom of the screen, I cannot scroll as there is
//     no extended 'off screen' question." The card's action row used to
//     relocate into an absolutely-positioned hover popover whose height was
//     capped against the whole viewport rather than the space actually left
//     below the card, and hovering the card AT ALL (including hovering the
//     button itself) triggered the relocation - so moving toward TO LIBRARY
//     to click it was exactly what pushed it out of reach.
// (2) After removing the hover-expand entirely to fix (1): "the hover to
//     see full question was something I told you was essential weeks ago -
//     this is your solution to take away something I need??!"
// Net: hover-to-expand for READING must stay, but the action buttons must
// never move. The fix is growing the card in normal document flow on
// hover (height:auto, not an absolutely-positioned popover) - the page
// itself becomes scrollable to reach a taller card, same as any other flow
// content, and the actions render in exactly one place in the markup,
// never duplicated into a hover-only branch.
test("round-prep question card grows in normal flow on hover, but actions never relocate", () => {
  assert.doesNotMatch(page, /qi-prep-question-preview/);
  assert.match(page, /const isCardHovered = !isEditing && hoveredQuestionKey === editKey/);
  assert.match(page, /height: isEditing \|\| isPairs \|\| isCardHovered \? undefined : 190/);
  assert.match(page, /const questionActions = \([\s\S]*>EDIT<\/HostButton>[\s\S]*"REGEN"/);
  // questionActions appears exactly once in the returned JSX (never a
  // second, hover-only copy inside some other container).
  assert.equal((page.match(/\{questionActions\}/g) || []).length, 1);
  assert.match(page, /<div style=\{\{ flex: isCardHovered \? undefined : 1, overflow: isCardHovered \? "visible" : "hidden" \}\}>\{cardBody\}<\/div>\s*\{questionActions\}/);
  assert.match(page, />TO LIBRARY<\/HostButton>/);
  assert.match(page, /moveQuestionToLibrary\(activeRound, qi\)/);
});
