import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const keypad = readFileSync(new URL("../components/AnswerKeypad.tsx", import.meta.url), "utf8");
const player = readFileSync(new URL("../components/PlayerQuizScreen.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("handset keypad and sequence lock actions use the full available width", () => {
  assert.match(keypad, /className="qi-player-keypad__actions"/);
  assert.match(player, /className="qi-player-sequence__actions"/);
  assert.match(css, /\.qi-player-question-screen \.qi-player-keypad__actions,[\s\S]*width:100%; max-width:none; box-sizing:border-box;/);
  assert.match(css, /\.qi-player-question-screen \.qi-player-keypad__submit,[\s\S]*min-width:0; box-sizing:border-box;/);
});

test("live handset does not show a redundant speed-bonus label", () => {
  assert.doesNotMatch(player, /Speed bonus/i);
});
