import test from "node:test";
import assert from "node:assert/strict";
import { initTeamScores } from "../lib/quiz/scoreService.ts";

test("large-room initialization uses one batch write and one scoreboard publish", async () => {
  const writes = [];
  let scoreboardReads = 0;
  let scoreboardWrites = 0;
  const client = {
    from(table) {
      if (table === "scores") return {
        upsert: async rows => { writes.push(rows); return { error: null }; },
        select: () => ({ eq: () => ({ order: async () => { scoreboardReads += 1; return { data: [], error: null }; } }) }),
      };
      return { update: () => ({ eq: () => ({ select: async () => { scoreboardWrites += 1; return { data: [{ id: "session" }], error: null }; } }) }) };
    },
  };
  const result = await initTeamScores(client, "1234", Array.from({ length: 50 }, (_, index) => `Team ${index + 1}`));
  assert.equal(result.error, undefined);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].length, 50);
  assert.equal(scoreboardReads, 1);
  assert.equal(scoreboardWrites, 1);
});

test("rejected initialization is surfaced and never publishes a false leaderboard", async () => {
  let sessionWrite = false;
  const client = {
    from(table) {
      if (table === "scores") return { upsert: async () => ({ error: { message: "denied" } }) };
      sessionWrite = true;
      return {};
    },
  };
  const result = await initTeamScores(client, "1234", ["Late Team"]);
  assert.equal(result.applied, false);
  assert.equal(result.error, "denied");
  assert.equal(sessionWrite, false);
});

test("duplicate and blank team names are removed before initialization", async () => {
  let rows = [];
  const client = {
    from(table) {
      if (table === "scores") return {
        upsert: async value => { rows = value; return { error: null }; },
        select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
      };
      return { update: () => ({ eq: () => ({ select: async () => ({ data: [{ id: "session" }], error: null }) }) }) };
    },
  };
  await initTeamScores(client, "1234", [" Jazz ", "Jazz", "", "Mama"]);
  assert.deepEqual(rows.map(row => row.team_name), ["Jazz", "Mama"]);
});
