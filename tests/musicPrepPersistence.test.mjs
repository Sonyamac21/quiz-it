import test from 'node:test';
import assert from 'node:assert/strict';
import { saveMusicClip, findSavedTrack } from '../lib/quiz/musicPrep.ts';
const song = title => ({ question_type: 'audio', question_text: `Name ${title}`, correct_answer: title, option_a: title, option_b: null });

test('saving from a stale prep screen preserves other saved clips and retries competing writes', async () => {
  const original = [song('One'), song('Two')];
  let database = [{ ...original[0], option_b: 'saved-one' }, original[1]];
  let writes = 0;
  const result = await saveMusicClip(original[1], 1, 'saved-two', async () => structuredClone(database), async (before, after) => {
    if (++writes === 1) { database[0].option_b = 'newer-one'; return false; }
    assert.deepEqual(before, database);
    database = after;
    return true;
  });
  assert.equal(result[0].option_b, 'newer-one');
  assert.equal(result[1].option_b, 'saved-two');
});
test('a replaced question cannot receive an old track', async () => {
  await assert.rejects(saveMusicClip(song('Old'), 0, 'clip', async () => [song('New')], async () => true), /question changed/);
});
test('saved track recovery matches title and artist and refuses ambiguous trims', () => {
  const asset = { title: 'Let It Go', artist: 'Idina Menzel', file_url: 'https://store.private.blob.vercel-storage.com/clip.wav' };
  assert.equal(findSavedTrack('Let It Go - Idina Menzel', [asset]), asset.file_url);
  assert.equal(findSavedTrack('Let It Go', [asset]), null);
  assert.equal(findSavedTrack('Let It Go - Idina Menzel', [asset, { ...asset, file_url: asset.file_url + '2' }]), null);
});
