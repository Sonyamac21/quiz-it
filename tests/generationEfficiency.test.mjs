import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/quiz/generateRound.ts', import.meta.url), 'utf8');
function runner(rejectCount = 0, overrides = {}) {
  const exports = {};
  let calls = 0;
  let checks = 0;
  const feedback = [];
  const core = {
    shuffle: x => [...x], genUid: () => String(calls),
    GENERAL_TOPIC_BUCKETS: [['geography']], MUSIC_TOPICS: ['music'], PICTURE_TOPICS: ['animals'],
    createGenerationContext: () => ({ error: '', report: { stages: {} } }),
    generateOne: async (type, topic, context, opts) => {
      feedback.push(opts.replacementFeedback);
      return { question_text: `Question ${++calls}`, question_type: type };
    },
    validateCandidate: async () => ({ ok: ++checks > rejectCount, category: 'Final quality', reason: 'Ambiguous wording', stages: {} }),
    duplicateRejectionReason: () => null, commitToMemory: async () => {},
    registerAccepted: () => {}, blacklistRejected: () => {},
    ...overrides,
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: () => core, console,
  });
  return { run: count => exports.generateValidatedRound({ count, roundType: 'regular', difficulty: 'medium', theme: '', allowedQuestionTypes: ['number'] }, {}), calls: () => calls, feedback };
}

test('successful rounds and single-question top-ups never launch surplus candidates', async () => {
  for (const count of [0, 1, 2, 10, 15]) {
    const r = runner();
    const result = await r.run(count);
    assert.equal(result.questions.length, count);
    assert.equal(r.calls(), count);
  }
});

test('rejections refill only missing slots and feed the reason to replacements', async () => {
  const r = runner(2);
  const result = await r.run(5);
  assert.equal(result.questions.length, 5);
  assert.equal(r.calls(), 7);
  assert.ok(r.feedback.some(x => x?.includes('Ambiguous wording')));
});

test('persistent quality failures stop within the bounded attempt allowance', async () => {
  const r = runner(Infinity);
  const result = await r.run(2);
  assert.equal(result.stoppedEarly, true);
  assert.ok(r.calls() <= 12);
});

const coreSource = readFileSync(new URL('../lib/quiz/questionGenerationCore.ts', import.meta.url), 'utf8');
function validationRunner(response) {
  const exports = {};
  const requests = [];
  vm.runInNewContext(ts.transpileModule(coreSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: () => ({}), console, AbortController, setTimeout, clearTimeout,
    fetch: async (url, init) => {
      requests.push(JSON.parse(init.body));
      return { status: 200, text: async () => JSON.stringify(response) };
    },
  });
  return { exports, requests };
}
const candidate = { question_type: 'number', question_text: 'How many sides does a triangle have?', correct_answer: '3' };

test('failed combined validation fails closed without three extra paid requests', async () => {
  const r = validationRunner({ error: { message: 'Provider unavailable' } });
  const result = await r.exports.runCombinedValidation(candidate, [], 'Shapes');
  assert.equal(r.requests.length, 1);
  assert.equal(result.moderation.ok, false);
  assert.equal(result.moderation.unavailable, true);
  assert.equal(result.quality.ok, false);
});

test('combined validation includes explicit theme relevance alongside factual checks', async () => {
  const r = validationRunner({ content: [{ type: 'tool_use', name: 'return_validation_result', input: {
    moderation_ok: true, quality_ok: true, balance_ok: true,
  } }] });
  const result = await r.exports.runCombinedValidation(candidate, [], 'Shapes');
  assert.equal(r.requests.length, 1);
  assert.match(r.requests[0].prompt, /THEME RELEVANCE/);
  assert.match(r.requests[0].prompt, /"theme":"Shapes"/);
  assert.equal(result.quality.ok, true);
});


test('parallel rounds reserve accepted facts before awaiting the memory save', async () => {
  const reserved = new Set();
  let generated = 0;
  const r = runner(0, {
    generateOne: async () => ({ question_type: 'number', question_text: ++generated <= 2 ? 'Shared fact' : `Fresh fact ${generated}` }),
    duplicateRejectionReason: q => reserved.has(q.question_text) ? 'duplicate' : null,
    registerAccepted: (state, q) => reserved.add(q.question_text),
    commitToMemory: async () => { await new Promise(resolve => setImmediate(resolve)); },
  });
  const results = await Promise.all([r.run(1), r.run(1)]);
  const questions = results.flatMap(result => result.questions);
  assert.equal(questions.length, 2);
  assert.equal(new Set(questions.map(q => q.question_text)).size, 2);
});

test('early duplicate drafts are blacklisted and included in the next paid prompt', async () => {
  const duplicate = { question_type: 'number', question_text: 'How many stars appear on the flag of China?', correct_answer: '5' };
  const r = validationRunner({ content: [{ type: 'text', text: JSON.stringify([duplicate]) }] });
  const exclusions = r.exports.emptyExclusionState();
  exclusions.used.push(duplicate.question_text);
  const opts = { theme: 'flag', difficulty: 'easy', roundType: 'bonus', exclusions };
  const first = await r.exports.generateOne('number', 'flag', r.exports.createGenerationContext('number', true), opts);
  assert.equal(first, null);
  assert.ok(exclusions.rejectedTexts.has(r.exports.normalizeQuestionText(duplicate.question_text)));
  await r.exports.generateOne('number', 'flag', r.exports.createGenerationContext('number', true), opts);
  assert.equal(r.requests.length, 2);
  assert.match(r.requests[0].prompt, /FRESH SUBJECT:/);
  assert.ok(r.requests[1].prompt.includes(r.exports.normalizeQuestionText(duplicate.question_text)));
});
