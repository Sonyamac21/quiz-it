import test from 'node:test';
import assert from 'node:assert/strict';
import { getTimerForQuestion } from '../lib/quiz/questionTimer.ts';

test('text questions use 20 seconds regardless of legacy type or a 30-second fallback', () => {
  for (const question_type of ['text', 'text_answer', 'picture', 'audio']) {
    assert.equal(getTimerForQuestion({ question_type, correct_answer: 'Paris' }, 30), 20);
  }
});

test('numeric and multiple-choice questions use 10 seconds', () => {
  for (const question_type of ['number', 'nearest_wins', 'multiple_choice']) {
    assert.equal(getTimerForQuestion({ question_type }, 30), 10);
  }
  for (const question_type of ['text', 'text_answer', 'picture', 'audio']) {
    assert.equal(getTimerForQuestion({ question_type, correct_answer: '1996' }, 30), 10);
  }
});

test('other question timers retain their configured behavior', () => {
  assert.equal(getTimerForQuestion({ question_type: 'sequence' }, 30), 15);
  assert.equal(getTimerForQuestion({ question_type: 'multi_tap' }, 30), 10);
  for (const question_type of ['picture', 'audio']) {
    assert.equal(getTimerForQuestion({ question_type }, 30), 20);
  }
});

 test('legacy and missing type labels cannot give a typed answer 30 seconds', () => {
  assert.equal(getTimerForQuestion({ question_type: 'written', correct_answer: 'Paris' }, 30), 20);
  assert.equal(getTimerForQuestion({ correct_answer: 'Paris' }, 30), 20);
});
