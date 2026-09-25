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

test("handset question families expand into available vertical space", () => {
  assert.match(player, /className="qi-player-keypad-wrap"/);
  assert.match(css, /\.qi-player-question-screen \.qi-player-question-scroll > \.fbl,[\s\S]*flex:1 1 0; min-height:0;/);
  assert.match(css, /data-answer-type="multiple_choice"[\s\S]*flex:1 1 0; max-height:92px/);
  assert.match(css, /data-answer-type="multi_tap"[\s\S]*grid-auto-rows:minmax\(48px,1fr\)/);
  assert.match(css, /@media \(min-height:700px\)[\s\S]*qi-player-question-text[\s\S]*font-size:clamp\(24px,4dvh,34px\)/);
});

test("handsets continuously recover native and iOS screen-awake protection", () => {
  assert.match(player, /window\.setInterval\(reacquire, 5000\)/);
  assert.match(player, /window\.addEventListener\("online", reacquire\)/);
  assert.match(player, /document\.addEventListener\("touchend", reacquire/);
  assert.match(player, /video\.setAttribute\("autoplay", ""\)/);
  assert.match(player, /z-index:0;transform:translateZ\(0\)/);
  assert.match(player, /video\.addEventListener\("pause", resume\)/);
});
