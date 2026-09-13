import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const host = readFileSync(new URL("../app/host/quiz/page.tsx", import.meta.url), "utf8");
const display = readFileSync(new URL("../app/host/display/page.tsx", import.meta.url), "utf8");
const player = readFileSync(new URL("../components/PlayerQuizScreen.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

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

test("TV question, picture and reveal copy all remain inside fixed stages", () => {
  assert.match(display, /FitQuestionText className="qd-q"/);
  assert.match(display, /FitBlockText className="qi-display-picture-question-text"/);
  assert.match(display, /FitBlockText className="qi-display-answer-question"/);
  assert.match(display, /FitBlockText className="qi-display-answer-hero-text"/);
  assert.match(css, /\.qi-display-answer-explanation[^{]*\{[^}]*-webkit-line-clamp:3/);
  assert.match(display, /className="qi-display-fullscreen-top"/);
  assert.match(css, /\.qi-display-fullscreen-top\s*\{[^}]*top:/s, "fullscreen control stays away from the bottom-right brand signature");
});
