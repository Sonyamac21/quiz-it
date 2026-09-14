import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const host = readFileSync(new URL("../app/host/quiz/page.tsx", import.meta.url), "utf8");

test("celebration cannot publish before automatic scoring finishes", () => {
  assert.match(host, /scoringInProgressRef\.current = true;[\s\S]*await autoScore\([\s\S]*scoringInProgressRef\.current = false;/);
  assert.match(host, /async function doCelebrate\(\)[\s\S]*if \(scoringInProgressRef\.current\)/);
  assert.match(host, /disabled=\{scoringInProgress\}[\s\S]*Confirming scores/);
});

test("spacebar progression is blocked while scores are being confirmed", () => {
  assert.match(host, /function handleSpacebar\(\)[\s\S]*if \(scoringInProgressRef\.current\)/);
});

test("timer startup cannot collapse into reveal on a rapid second Space press", () => {
  assert.match(host, /const activePhase = hostPhaseRef\.current/);
  assert.match(host, /activePhase === "timer"[\s\S]*timerStartPendingRef\.current[\s\S]*timerRevealAllowedAtRef\.current/);
  assert.match(host, /hostPhaseRef\.current = "timer";[\s\S]*setHostPhase\("timer"\)/);
});

test("one Space press remains visibly active until its transition finishes", () => {
  assert.match(host, /async function handleSpacebar\(\)/);
  assert.match(host, /setSpaceActionPending\(true\)[\s\S]*await doStartRound\(\)/);
  assert.match(host, /finally \{[\s\S]*advancingRef\.current = false;[\s\S]*setSpaceActionPending\(false\)/);
  assert.match(host, /aria-busy=\{spaceActionPending\}/);
  assert.match(host, /spaceActionPending \? "Working…" : nextActionLabel/);
});

test("host timer and handsets share one persisted wall-clock deadline", () => {
  assert.match(host, /const startedAtMs = Date\.now\(\);[\s\S]*const deadlineMs = startedAtMs \+ dur \* 1000/);
  assert.match(host, /timer_started_at: now,[\s\S]*timer_duration: dur/);
  assert.match(host, /Math\.ceil\(\(deadlineMs - Date\.now\(\)\) \/ 1000\)/);
  const timerWrite = host.indexOf('timer_started_at: now');
  const timeoutRead = host.indexOf('.select("block_pending, block_team")', timerWrite);
  assert.ok(timerWrite >= 0 && timeoutRead > timerWrite, "timer must publish before the Time-Out lookup");
});
