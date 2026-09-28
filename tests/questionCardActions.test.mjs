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

// Host: "I still cannot generate a picture question when needed if adding
// a question to a round." The other three "+ ADD QUESTIONS" tabs
// (SEARCH LIBRARY, RANDOM, TYPE YOUR OWN) only reuse already-saved
// library rows or take plain typed text with no type field at all - none
// of them can ask the AI to generate a fresh question of a chosen type. A
// GENERATE tab, with its own type <select>, now calls the same
// generateMoreForRound the round-level top-up button uses, with an
// explicit one-off type override that takes priority over the round's own
// Include: Picture/Music default.
test("round-prep add-questions panel offers a GENERATE tab with a type picker", () => {
  assert.match(page, /async function generateMoreForRound\(round: QuizRound, requested: number, typeOverride\?: string\[\]\)/);
  assert.match(page, /allowedQuestionTypes: typeOverride \?\? cfg\?\.allowedQuestionTypes/);
  assert.match(page, /"GENERATE", aiGenerateOpenId === activeRound\.id/);
  assert.match(page, /<select value=\{aiGenerateType\}/);
  assert.match(page, /allowedLibraryTypesForRound\(activeRound\.round_type\)\.map\(t => \(/);
  assert.match(page, /onClick=\{\(\) => generateMoreForRound\(activeRound, aiGenerateCount, aiGenerateType \? \[aiGenerateType\] : undefined\)\}/);
});
