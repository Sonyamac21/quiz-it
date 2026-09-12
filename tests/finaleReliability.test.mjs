import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const host = readFileSync(new URL("../app/host/quiz/page.tsx", import.meta.url), "utf8");
const player = readFileSync(new URL("../components/PlayerQuizScreen.tsx", import.meta.url), "utf8");
const display = readFileSync(new URL("../app/host/display/page.tsx", import.meta.url), "utf8");

test("finale confirms authoritative scores before changing the display phase", () => {
  const syncAt = host.indexOf("const scoreboard = await syncScoreboardData(supabase, sessionPin)");
  const phaseAt = host.indexOf('phase: "quiz_end"', syncAt);
  assert.ok(syncAt >= 0 && phaseAt > syncAt);
  assert.match(host, /if \(scoreboard\.error\)[\s\S]*?return;/);
});

test("entering the finale atomically disables cards and leaderboard overlays", () => {
  assert.match(host, /phase: "quiz_end",[\s\S]*?allow_power_cards: false,[\s\S]*?show_scoreboard: false,[\s\S]*?show_scoreboard_on_display: false/);
  assert.match(player, /phase !== "quiz_end"/);
});

test("host refresh restores finale reveal progress", () => {
  assert.match(host, /quizEndRevealedRef\.current = data\.quiz_end_revealed_count/);
});

test("failed reveal writes do not advance the local reveal counter", () => {
  const fn = host.slice(host.indexOf("async function doRevealNextTeam"), host.indexOf("async function revealAllFinalResults"));
  const confirmedAt = fn.indexOf("if (error || !data?.length)");
  const counterAt = fn.indexOf("quizEndRevealedRef.current = nextCount");
  assert.ok(confirmedAt >= 0 && counterAt > confirmedAt);
});

test("display reveal uses the scores from the same realtime payload", () => {
  assert.match(display, /handleRevealNext\(syncedCount, scores\)/);
});

test("display refresh resumes persisted finale progress instead of rewinding", () => {
  assert.match(display, /prevQuizEndRevealedRef\.current = syncedCount/);
  assert.match(display, /setRevealedCount\(syncedCount\)/);
  assert.match(display, /setTrophyVisible\(syncedTrophy\)/);
});

test("reveal-all path also verifies scores and disables post-game cards", () => {
  const fn = host.slice(host.indexOf("async function revealAllFinalResults"), host.indexOf("// teamNameOverride"));
  assert.match(fn, /syncScoreboardData\(supabase, sessionPin\)/);
  assert.match(fn, /allow_power_cards: false/);
  assert.match(fn, /if \(error \|\| !data\?\.length\)/);
});
