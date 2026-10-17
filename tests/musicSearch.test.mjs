import test from 'node:test';
import assert from 'node:assert/strict';
import { rankMusicResults } from '../lib/media/musicSearch.ts';
const track = (title, artist) => ({ title, artist, preview_url: 'preview' });
test('original artist ranks above misleading titles and covers across catalogues', () => {
  const results = rankMusicResults('Too Sweet - Hozier', [track('Too sweet hozier', 'All purpose rain'), track('Too Sweet (Hozier Cover)', 'Twelve XII'), track('Too Sweet', 'Hozier'), track('Too Sweet', 'Hozier')]);
  assert.equal(results[0].artist, 'Hozier');
  assert.equal(results.length, 3);
});
test('explicitly requested versions are not penalised as unwanted covers', () => {
  const results = rankMusicResults('Too Sweet (Cover) - Singer', [track('Too Sweet', 'Singer'), track('Too Sweet (Cover)', 'Singer')]);
  assert.equal(results[0].title, 'Too Sweet (Cover)');
});
