import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
const code = ts.transpileModule(readFileSync('lib/quiz-builder/savedRounds.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {}, structuredClone, TextEncoder, crypto: webcrypto, Uint8Array };
vm.runInNewContext(code, context);
const { savedRoundPayload, savedRoundId } = context.exports;
const round = { id: 'source', name: 'Round', round_type: 'regular', difficulty: 'easy', theme: 'animals', questions: [{ question_text: 'Music?', correct_answer: 'Song', audio_url: 'saved.mp3', clip_start: 3, brain_teaser: true, country_clues: ['clue'], pairs: [{ left: 'a', right: 'b' }] }], hide_leaderboard: true, allow_power_cards: false, points_per_question: 8, danger_zone_enabled: false, danger_zone_penalty: 5, max_time_bonus: 0 };
test('holding copy retains complete question JSON and gameplay settings independently', () => {
 const payload = savedRoundPayload(round, 'Sunday');
 assert.deepEqual(payload.questions, round.questions);
 assert.equal(payload.synced_from_quiz_round_id, null);
 assert.equal(payload.folder, 'Saved for later');
 assert.equal(payload.theme, 'animals');
 assert.equal(payload.points_per_question, 8);
 payload.questions[0].country_clues.push('changed');
 assert.deepEqual(round.questions[0].country_clues, ['clue']);
});
test('retries reuse the saved ID; changed content creates a separate snapshot', async () => {
 const payload = savedRoundPayload(round, 'Sunday');
 const id = await savedRoundId(round.id, payload);
 assert.equal(await savedRoundId(round.id, structuredClone(payload)), id);
 payload.questions[0].correct_answer = 'Different';
 assert.notEqual(await savedRoundId(round.id, payload), id);
 assert.notEqual(await savedRoundId('another-round', savedRoundPayload(round, 'Sunday')), id);
});
