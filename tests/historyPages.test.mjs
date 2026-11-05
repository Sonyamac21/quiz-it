import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHistoryPages } from '../lib/quiz/historyPages.ts';
test('history reads every page in stable order with at most four simultaneous requests', async () => {
  const source = Array.from({ length: 2537 }, (_, i) => i);
  let active = 0, maximum = 0;
  const rows = await loadHistoryPages(async (from, to) => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, (from % 3) + 1));
    active--; return source.slice(from, to + 1);
  });
  assert.deepEqual(rows, source);
  assert.equal(maximum, 4);
});
test('a history-page failure rejects the whole load rather than losing duplicate protection', async () => {
  await assert.rejects(loadHistoryPages(async from => {
    if (from === 1000) throw new Error('History unavailable');
    return Array(500).fill('row');
  }), /History unavailable/);
});
