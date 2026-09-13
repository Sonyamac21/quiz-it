import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const player = readFileSync(new URL("../components/PlayerQuizScreen.tsx", import.meta.url), "utf8");

test("the first valid lock tap receives immediate visible acknowledgement", () => {
  const submit = player.slice(player.indexOf("async function submitAnswer"), player.indexOf("async function claimHotSeat"));
  assert.ok(submit.indexOf("setSubmitted(true)") < submit.indexOf('.from("sessions")'), "pending state must appear before the network preflight");
  assert.match(submit, /setSubmissionPending\(true\)/);
  assert.match(player, /submissionPending \? "LOCKING…" : "LOCKED IN ✓"/);
});

test("server timer rejection reopens the answer instead of showing a false lock", () => {
  const submit = player.slice(player.indexOf("async function submitAnswer"), player.indexOf("async function claimHotSeat"));
  assert.match(submit, /if \(!answering \|\| movedOn \|\| timerNotStarted \|\| expired \|\| wrongHotSeatTeam\) \{[\s\S]*setSubmitted\(false\);[\s\S]*setSubmissionPending\(false\)/);
});

test("multiple-choice and Multi Tap lock controls are real touch buttons", () => {
  assert.match(player, /<button type="button" className=\{"lockbar" \+ \(selectedAnswer/);
  assert.match(player, /<button type="button" className=\{"lockbar" \+ \(tappedItems\.length/);
});
