import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/host/quiz/page.tsx", import.meta.url), "utf8");

test("host refresh maps the public intermission phase back to its round-end controls", () => {
  assert.match(source, /if \(restoredPhase === "intermission"\) restoredPhase = "round_end"/);
});

test("host refresh resumes an active timer from persisted wall-clock time", () => {
  assert.match(source, /restoredPhase === "timer" && data\.timer_started_at && data\.timer_duration/);
  assert.match(source, /Math\.max\(0, Math\.ceil\(\(data\.timer_duration as number\) - elapsed\)\)/);
});

test("realtime recovery reloads session, teams, answers, cards and scores", () => {
  assert.match(source, /await restoreSessionState\(data as Record<string, unknown>\)/);
  assert.match(source, /Promise\.all\(\[loadRounds\(data\.id\), loadTeams\(sessionPin\), loadAnswers\(sessionPin, qIdxRef\.current\), loadUnoCards\(sessionPin\), loadScores\(sessionPin\)\]\)/);
});

test("host refresh preserves a question preview without exposing it to players", () => {
  assert.match(source, /saveHostPreviewRecovery\(window\.sessionStorage, \{ sessionId, roundId: selectedRound\.id, questionIndex: idx \}\)/);
  assert.match(source, /setHostPhase\(hasMatchingPreview \? "preview" : restoredPhase as HostPhase\)/);
  assert.match(source, /clearHostPreviewRecovery\(window\.sessionStorage\)/);
});
