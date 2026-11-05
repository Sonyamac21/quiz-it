import test from 'node:test';
import assert from 'node:assert/strict';
import { saveGeneratedRound } from '../lib/quiz/saveGeneratedRound.ts';
test('a generation save retries concurrent edits, preserves clips and keeps the brain teaser last', async () => {
  const clip = { _uid: 'music', question_type: 'audio', option_b: 'saved-clip' };
  const teaser = { _uid: 'final', question_type: 'number', brain_teaser: true };
  let database = { questions: [clip, teaser], target_count: 2 };
  let writes = 0;
  const incoming = [{ _uid: 'new', question_type: 'multiple_choice', question_text: 'New fact' }];
  const saved = await saveGeneratedRound(incoming, async () => structuredClone(database), async (before, after) => {
    if (++writes === 1) { database.questions[0].option_b = 'newer-clip'; return false; }
    assert.deepEqual(before, database); database = after; return true;
  });
  assert.equal(saved.added, 1);
  assert.equal(saved.questions[0].option_b, 'newer-clip');
  assert.equal(saved.questions.at(-1)._uid, 'final');
  assert.equal(saved.questions.length, 3);
});
test('failed reads and repeated conflicts cannot overwrite a round', async () => {
  let writes = 0;
  await assert.rejects(saveGeneratedRound([], async () => { throw new Error('Read failed'); }, async () => { writes++; return true; }), /Read failed/);
  assert.equal(writes, 0);
  await assert.rejects(saveGeneratedRound([], async () => ({ questions: [], target_count: 10 }), async () => { writes++; return false; }), /round changed/);
  assert.equal(writes, 3);
});
test('retrying a saved result is idempotent and never silently deletes an existing invalid question', async () => {
  const incoming = [{ _uid: 'new', question_text: 'New fact' }];
  const database = { questions: [{ _uid: 'old', question_type: 'multi_tap', correct_answer: '' }, ...incoming], target_count: 2 };
  const saved = await saveGeneratedRound(incoming, async () => database, async () => true);
  assert.equal(saved.added, 0);
  assert.equal(saved.questions.length, 2);
  assert.equal(saved.questions[0].correct_answer, '');
});
