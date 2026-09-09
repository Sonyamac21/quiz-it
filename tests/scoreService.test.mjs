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
