import test from "node:test";
import assert from "node:assert/strict";
import { createRefreshQueue } from "../lib/diagnostics/hostPerformance.ts";

test("50 score events during a read cause just one trailing read", async () => {
  const queue = createRefreshQueue();
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  let reads = 0;
  const first = queue(async () => { reads++; await blocked; });
  await Promise.resolve();
  const rest = Array.from({ length: 50 }, () => queue(async () => { reads++; }));
  release();
  await Promise.all([first, ...rest]);
  assert.equal(reads, 2);
});

test("queue can retry after a failed read", async () => {
  const queue = createRefreshQueue();
  await assert.rejects(queue(async () => { throw new Error("offline"); }));
  let recovered = false;
  await queue(async () => { recovered = true; });
  assert.equal(recovered, true);
});
