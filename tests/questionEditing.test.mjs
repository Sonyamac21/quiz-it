import test from 'node:test';
import assert from 'node:assert/strict';
import { editAnswerKey, saveRoundQuestionEdit } from '../lib/quiz/questionEditing.ts';
test('Multi Tap toggles independently while single choice and sequence keep their own editing semantics', () => {
  assert.equal(editAnswerKey('multi_tap', 'a,c', 'b'), 'a,b,c');
  assert.equal(editAnswerKey('multi_tap', 'a,b,c', 'b'), 'a,c');
  assert.equal(editAnswerKey('multiple_choice', 'a', 'b'), 'b');
  assert.equal(editAnswerKey('sequence', 'b,a,c,d', 'a'), 'b,a,c,d');
});
test('manual edits preserve newly saved clips and other concurrent questions', async () => {
  const original = { _uid: 'song', question_type: 'audio', question_text: 'Name this song', option_b: null };
  const other = { _uid: 'other', question_text: 'New question' };
  let database = [{ ...original, option_b: 'fresh-clip' }, other];
  const saved = await saveRoundQuestionEdit(original, { ...original, question_text: 'Name this track' }, async () => database, async (before, after) => { database = after; return true; });
  assert.equal(saved[0].option_b, 'fresh-clip');
  assert.equal(saved[0].question_text, 'Name this track');
  assert.deepEqual(saved[1], other);
});
