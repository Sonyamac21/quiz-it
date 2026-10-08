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
    MAX_AI_CONCURRENCY: 8,
    loadUsedQuestions: async () => ({ used: [], usedAnswers: [], usedFingerprints: new Set(), rejectedFingerprints: new Set(), rejectedTexts: new Set() }),
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
  return { runAll: (specs, onComplete) => exports.generateAllRounds(specs, undefined, onComplete), run: (count, audience) => exports.generateValidatedRound({ count, audience, roundType: 'regular', difficulty: 'medium', theme: '', allowedQuestionTypes: ['number'] }, {}), calls: () => calls, feedback };
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


test('family round generation uses family topics and passes audience into every draft', async () => {
  const seen = [];
  const r = runner(0, {
    FAMILY_TOPIC_BUCKETS: [['animals', 'space']], FAMILY_MUSIC_TOPICS: ['family songs'],
    generateOne: async (type, topic, context, opts) => {
      seen.push({ topic, audience: opts.audience });
      return { question_type: type, question_text: topic };
    },
  });
  const result = await r.run(2, 'families');
  assert.equal(result.questions.length, 2);
  assert.deepEqual(seen, [{ topic: 'animals', audience: 'families' }, { topic: 'space', audience: 'families' }]);
});

test('family audience reaches the writer and the final quality checker', async () => {
  const r = validationRunner({ content: [{ type: 'text', text: JSON.stringify([candidate]) }] });
  const q = await r.exports.generateOne('number', 'animals', r.exports.createGenerationContext('number', false), {
    theme: '', difficulty: 'easy', forceObscure: true, roundType: 'regular', audience: 'families', exclusions: r.exports.emptyExclusionState(),
  });
  assert.ok(q);
  assert.equal(q._audience, 'families');
  assert.equal(q.difficulty, 'easy');
  assert.match(r.requests[0].prompt, /Vary the work or subject instead of making the facts more obscure/);
  assert.doesNotMatch(r.requests[0].prompt, /lean toward something a deeper cut/);
  assert.match(r.requests[0].prompt, /Kids and families/);
  assert.match(r.requests[0].prompt, /Easy means familiar main characters/);
  await r.exports.runCombinedValidation(q, [], '');
  assert.match(r.requests[1].prompt, /Kids and families/);
  assert.match(r.requests[1].prompt, /"difficulty":"easy"/);
  assert.match(r.requests[1].prompt, /reject questions unsuitable for this audience/);
  assert.match(r.exports.audienceBrief(), /Adults aged 25-55/);
});


test('bulk generation limits active round pipelines and completes every queued round', async () => {
  let active = 0, peak = 0, id = 0;
  const r = runner(0, { generateOne: async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return { question_type: 'number', question_text: `Question ${++id}` };
  } });
  const specs = Array.from({ length: 6 }, () => ({ count: 1, roundType: 'regular', difficulty: 'easy', theme: '', allowedQuestionTypes: ['number'] }));
  const results = await r.runAll(specs);
  assert.equal(peak, 2);
  assert.equal(results.length, 6);
  assert.ok(results.every(result => result.questions.length === 1 && !result.stoppedEarly));
});

test('a failed save callback runs once and retains generated questions', async () => {
  const r = runner();
  let saves = 0;
  const results = await r.runAll([{ count: 1, roundType: 'regular', difficulty: 'easy', theme: '', allowedQuestionTypes: ['number'] }], async () => { saves++; throw new Error('offline'); });
  assert.equal(saves, 1);
  assert.equal(results[0].questions.length, 1);
  assert.match(results[0].finalStatus, /Saving generated questions failed/);
});

test('a complete fifteen-question text round uses five draft batches without surplus work', async () => {
  let batches = 0, processed = 0, id = 0;
  const r = runner(0, {
    canBatchDraft: () => true,
    generateDraftBatch: async requests => {
      batches++;
      return requests.map(request => ({ question_type: request.type, question_text: `Fresh fact ${++id}`, correct_answer: String(id) }));
    },
    generateOne: async (type, topic, context, opts) => {
      assert.ok('draft' in opts, 'batch results must not trigger another writing call');
      processed++;
      return opts.draft;
    },
  });
  const result = await r.run(15);
  assert.equal(result.questions.length, 15);
  assert.equal(batches, 5);
  assert.equal(processed, 15);
});

test('a failed draft batch does not fan out into individual paid writing retries', async () => {
  let batches = 0;
  const r = runner(0, {
    canBatchDraft: () => true,
    generateDraftBatch: async () => { batches++; throw new Error('API key unavailable'); },
    generateOne: async () => { throw new Error('must not fall back to individual requests'); },
  });
  const result = await r.run(5);
  assert.equal(batches, 1);
  assert.equal(result.stoppedEarly, true);
  assert.equal(result.questions.length, 0);
});

test('draft batching includes relevant older history and preserves slot count', async () => {
  const r = validationRunner({ content: [{ type: 'text', text: JSON.stringify([candidate, null, candidate]) }] });
  const exclusions = r.exports.emptyExclusionState();
  exclusions.used = ['Which scientist discovered penicillin?', ...Array.from({length: 100}, (_, i) => `Unrelated question ${i}`)];
  const slots = Array.from({length: 3}, () => ({ type: 'number', topic: 'scientists and discoveries', difficulty: 'easy', unintendedSessionState: 'must-not-be-transmitted'.repeat(1000) }));
  const result = await r.exports.generateDraftBatch(slots, { theme: '', roundType: 'regular', exclusions });
  assert.equal(result.length, 3);
  assert.equal(result[1], null);
  assert.equal(r.requests.length, 1);
  assert.match(r.requests[0].prompt, /Which scientist discovered penicillin/);
  assert.ok(r.requests[0].prompt.length < 12000);
  assert.doesNotMatch(r.requests[0].prompt, /unintendedSessionState|must-not-be-transmitted/);
  assert.equal(r.exports.canBatchDraft({type: 'picture', topic: 'animals'}), false);
  assert.equal(r.exports.canBatchDraft({type: 'number', topic: 'recent news'}), false);
  assert.equal(r.exports.canBatchDraft({type: 'number', topic: 'animals'}), true);
});

test('an empty batch slot is not replaced by an unbudgeted writing request', async () => {
  const r = validationRunner({});
  const context = r.exports.createGenerationContext('number', false);
  const result = await r.exports.generateOne('number', 'animals', context, {
    theme: '', difficulty: 'easy', roundType: 'regular', exclusions: r.exports.emptyExclusionState(), draft: null,
  });
  assert.equal(result, null);
  assert.equal(r.requests.length, 0);
});
