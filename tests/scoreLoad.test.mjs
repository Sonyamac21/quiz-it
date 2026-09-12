import test from "node:test";
import assert from "node:assert/strict";

import { applyScoreDelta, syncScoreboardData } from "../lib/quiz/scoreService.ts";

function loadTestClient() {
  const scoreByTeam = new Map();
  const eventKeys = new Set();
  const scoreboardWrites = [];

  return {
    scoreByTeam,
    eventKeys,
    scoreboardWrites,
    async rpc(name, args) {
      assert.equal(name, "apply_score_delta");
      if (eventKeys.has(args.p_event_key)) return { data: [{ applied: false }], error: null };
      eventKeys.add(args.p_event_key);
      scoreByTeam.set(args.p_team_name, (scoreByTeam.get(args.p_team_name) ?? 0) + args.p_delta);
      return { data: [{ applied: true }], error: null };
    },
    from(table) {
      if (table === "scores") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [...scoreByTeam.entries()]
                  .map(([team_name, total_points]) => ({ team_name, total_points, round_points: total_points, correct_count: 1, fastest_count: 0 }))
                  .sort((a, b) => b.total_points - a.total_points),
                error: null,
              }),
            }),
          }),
        };
      }
      assert.equal(table, "sessions");
      return {
        update: value => ({
          eq: () => ({
            select: async () => {
              scoreboardWrites.push(value.scoreboard_data);
              return { data: [{ id: "session" }], error: null };
            },
          }),
        }),
      };
    },
  };
}

test("A10: fifty simultaneous teams receive one score each and all reach the leaderboard", async () => {
  const client = loadTestClient();
  const teams = Array.from({ length: 50 }, (_, index) => `Team ${index + 1}`);

  const firstPass = await Promise.all(teams.map(team => applyScoreDelta(client, "1234", team, 10, {
    eventKey: `autoscore:1234:r1:0:${team}`,
    isCorrect: true,
    syncScoreboard: false,
  })));
  assert.equal(firstPass.filter(result => result.applied).length, 50);

  // Model a full network retry of the scoring request. Database event keys
  // must make every repeated mutation a no-op.
  const retryPass = await Promise.all(teams.map(team => applyScoreDelta(client, "1234", team, 10, {
    eventKey: `autoscore:1234:r1:0:${team}`,
    isCorrect: true,
    syncScoreboard: false,
  })));
  assert.equal(retryPass.filter(result => result.applied).length, 0);

  const published = await syncScoreboardData(client, "1234");
  assert.equal(published.error, undefined);
  assert.equal(published.scores.length, 50);
  assert.equal(client.eventKeys.size, 50);
  assert.equal(client.scoreByTeam.size, 50);
  assert.ok([...client.scoreByTeam.values()].every(points => points === 10));
  assert.equal(client.scoreboardWrites.length, 1);
  assert.equal(client.scoreboardWrites[0].length, 50);
});
