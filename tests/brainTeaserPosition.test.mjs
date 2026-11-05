import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFinalBrainTeaser } from '../lib/quiz/brainTeaser.ts';
test('existing maths puzzle moves to the end without adding or losing questions', () => {
  const original = [{ question_type: 'number', question_text: 'Delivery puzzle', correct_answer: '40' }, { question_type: 'multiple_choice', question_text: 'Trivia' }];
  const result = makeFinalBrainTeaser(original, 0);
  assert.equal(result.length, 2);
  assert.equal(result[1].question_text, 'Delivery puzzle');
  assert.equal(result[1].brain_teaser, true);
  assert.equal(original[0].brain_teaser, undefined);
});
test('only the selected puzzle retains the final-brain-teaser marker', () => {
  const result = makeFinalBrainTeaser([{ question_type: 'number', brain_teaser: true }, { question_type: 'number' }], 1);
  assert.equal(result.filter(q => q.brain_teaser).length, 1);
  assert.equal(result[1].brain_teaser, true);
  assert.throws(() => makeFinalBrainTeaser([{ question_type: 'audio' }], 0));
});
