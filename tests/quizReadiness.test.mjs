import test from 'node:test';
import assert from 'node:assert/strict';
import { getQuizPreflight } from '../lib/quiz/planStatus.ts';
const question = { question_type: 'text_answer', question_text: 'Which planet do we live on?', correct_answer: 'Earth' };
const check = (questions, extras = {}) => getQuizPreflight({ quiz_rounds: [{ id: 'round', name: 'Family round', round_type: 'regular', questions, ...extras }] });

test('saved target counts block a partially generated quiz', () => {
  assert.equal(check(Array(8).fill(question), { target_count: 15 }).ready, false);
  assert.equal(check(Array(15).fill(question), { target_count: 15 }).ready, true);
});
test('malformed multiple-choice content cannot start a live quiz', () => {
  assert.equal(check([{ ...question, question_type: 'multiple_choice', correct_answer: 'z' }]).ready, false);
  const valid = { ...question, question_type: 'multiple_choice', option_a: 'Earth', option_b: 'Mars', option_c: 'Venus', option_d: 'Jupiter', correct_answer: 'a' };
  assert.equal(check([valid]).ready, true);
  assert.equal(check([{ ...valid, option_b: 'Earth' }]).ready, false);
});
test('blank questions, missing answers and invalid numbers block readiness', () => {
  for (const q of [{ ...question, question_text: '' }, { ...question, correct_answer: '' }, { ...question, question_type: 'number', correct_answer: 'many' }]) assert.equal(check([q]).ready, false);
});
test('multi tap needs distinct correct keys and sequence a complete permutation', () => {
  const q = { ...question, option_a: 'A', option_b: 'B', option_c: 'C', option_d: 'D', option_e: 'E', option_f: 'F' };
  assert.equal(check([{ ...q, question_type: 'multi_tap', correct_answer: 'a,a' }], { round_type: 'multi_tap' }).ready, false);
  assert.equal(check([{ ...q, question_type: 'multi_tap', correct_answer: 'a,b' }], { round_type: 'multi_tap' }).ready, true);
  assert.equal(check([{ ...q, question_type: 'sequence', correct_answer: 'a,b,c,c' }]).ready, false);
  assert.equal(check([{ ...q, question_type: 'sequence', correct_answer: 'd,c,b,a' }]).ready, true);
});
test('word pairs count as questions and do not need photos', () => {
  const pairs = [{ question_type: 'pairs', pairs: ['1','2','3'].map(pair_id => ({ pair_id, a: { label: `Left ${pair_id}` }, b: { label: `Right ${pair_id}` } })) }];
  assert.equal(check(pairs, { round_type: 'pairs', target_count: 1 }).ready, true);
  assert.equal(check(pairs, { round_type: 'pairs', target_count: 2 }).ready, false);
});
