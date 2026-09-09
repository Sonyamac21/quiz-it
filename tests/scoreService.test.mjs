import test from "node:test";
import assert from "node:assert/strict";

import { applyScoreDelta } from "../lib/quiz/scoreService.ts";

test("automatic scoring can defer scoreboard publication until the batch finishes", async () => {
  let fromCalls = 0;
  const supabase = {
    rpc: async () => ({ data: [{ applied: true }], error: null }),
    from: () => {
      fromCalls += 1;
      throw new Error("scoreboard sync should be deferred");
    },
  };

  const result = await applyScoreDelta(supabase, "1234", "Jazz", 10, {
    eventKey: "autoscore:1234:r1:0:Jazz",
    syncScoreboard: false,
  });

  assert.deepEqual(result, { applied: true });
  assert.equal(fromCalls, 0);
});

test("an idempotent duplicate score event remains a no-op", async () => {
  const supabase = {
    rpc: async () => ({ data: [{ applied: false }], error: null }),
    from: () => { throw new Error("duplicate events must not refresh or reapply scores"); },
  };

  const result = await applyScoreDelta(supabase, "1234", "Jazz", 10, {
    eventKey: "autoscore:1234:r1:0:Jazz",
    syncScoreboard: false,
  });

  assert.deepEqual(result, { applied: false });
});

const { getScores, syncScoreboardData } = await import('../lib/quiz/scoreService.ts');

function syncClient(readResult, writeResult = { data: [{ id: 'session' }], error: null }) {
  const writes = [];
  return {
    writes,
    from(table) {
      if (table === 'scores') return { select: () => ({ eq: () => ({ order: async () => {
        if (readResult instanceof Error) throw readResult;
        return readResult;
      } }) }) };
      assert.equal(table, 'sessions');
      return { update: value => {
        writes.push(value);
        return { eq: () => ({ select: async () => writeResult }) };
      } };
    },
  };
}

test('failed score reads never overwrite the published scoreboard', async () => {
  const client = syncClient({ data: null, error: { message: 'offline' } });
  await assert.rejects(getScores(client, '1234'), /offline/);
  const result = await syncScoreboardData(client, '1234');
  assert.match(result.error, /offline/);
  assert.equal(client.writes.length, 0);
});

test('thrown network errors and missing data cannot publish empty scores', async () => {
  for (const failure of [new Error('network failed'), { data: null, error: null }]) {
    const client = syncClient(failure);
    assert.ok((await syncScoreboardData(client, '1234')).error);
    assert.equal(client.writes.length, 0);
  }
});

test('confirmed empty scoreboard remains a valid result', async () => {
  const client = syncClient({ data: [], error: null });
  assert.deepEqual(await syncScoreboardData(client, '1234'), { scores: [] });
  assert.deepEqual(client.writes, [{ scoreboard_data: [] }]);
});

test('failed and zero-row session updates are not reported as successful', async () => {
  for (const response of [{ data: null, error: { message: 'denied' } }, { data: [], error: null }]) {
    const client = syncClient({ data: [], error: null }, response);
    assert.ok((await syncScoreboardData(client, '1234')).error);
  }
});

test('retry after failed read publishes fresh authoritative scores', async () => {
  const scores = [{ team_name: 'Jazz', total_points: 42, round_points: 12 }];
  const client = syncClient({ data: scores, error: null });
  assert.deepEqual(await syncScoreboardData(client, '1234'), { scores });
  assert.deepEqual(client.writes, [{ scoreboard_data: scores }]);
});
