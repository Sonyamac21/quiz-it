import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Execute the production history/duplicate functions; any accidental network
// dependency fails the test instead of contacting the live service.
const source = readFileSync(new URL("../lib/quiz/questionGenerationCore.ts", import.meta.url), "utf8");
const exports = {};
let database;
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports, require: () => ({ createSupabaseBrowserClient: () => database }), console,
});
const { emptyExclusionState, registerAccepted, duplicateRejectionReason } = exports;
const pairs = { question_type: "pairs", pairs: [
  { a: { label: "Hammer" }, b: { label: "Nail" } },
  { a: { label: "Kettle" }, b: { label: "Teacup" } },
  { a: { label: "Lock" }, b: { label: "Key" } },
] };

test("Match Made history cannot crash subsequent ordinary round candidates", () => {
  const state = emptyExclusionState();
  registerAccepted(state, pairs);
  assert.equal(state.used.length, 0);
  assert.deepEqual(Array.from(state.usedAnswers), ["hammer + nail", "kettle + teacup", "key + lock"]);
  for (const type of ["text_answer", "multiple_choice", "multi_tap", "number"]) {
    const q = { question_type: type, question_text: "Which ocean surrounds the Maldives?", correct_answer: "Indian", option_a: "Indian" };
    assert.equal(duplicateRejectionReason(q, [pairs], "", state), null);
    registerAccepted(state, q);
    assert.ok(duplicateRejectionReason(q, [], "", state));
    state.used.length = 0; state.usedAnswers.length = 0; state.usedFingerprints.clear(); state.historyQuestions = [];
  }
});

test("stale undefined history entries are tolerated without disabling duplicate detection", () => {
  const state = emptyExclusionState();
  state.used.push(undefined, "Which ocean surrounds the Maldives?");
  const q = { question_type: "text_answer", question_text: "Which mountain overlooks Cape Town?", correct_answer: "Table Mountain" };
  assert.equal(duplicateRejectionReason(q, [pairs], "", state), null);
  registerAccepted(state, q);
  assert.ok(duplicateRejectionReason(q, [], "", state));
});

test("saved Quiz Plan pairs are excluded before library sync finishes", async () => {
  database = { from(table) { return { select() {
    return { order() { return { range() { return Promise.resolve({ data: table === "quiz_rounds" ? [{ questions: [pairs] }] : [] }); } }; } };
  } }; } };
  const history = await exports.loadUsedQuestions();
  assert.ok(history.usedAnswers.includes("hammer + nail"));
  assert.ok(history.usedAnswers.includes("key + lock"));
  assert.equal(history.used.includes(undefined), false);
});

test("failed Quiz Plan history read does not silently generate repeated content", async () => {
  database = { from(table) { return { select() {
    return { order() { return { range() { return Promise.resolve({ data: null, error: { message: "offline" } }); } }; } };
  } }; } };
  await assert.rejects(exports.loadUsedQuestions(), /Could not check saved Quiz Plans/);
});

const question = (text, answer = 'Paris', type = 'text_answer') => ({ question_text: text, correct_answer: answer, question_type: type });

test('every history source is paginated beyond the API row limit', async () => {
  const calls = [];
  database = { from(table) { return { select() { return { order() { return { range(start, end) {
    calls.push([table, start, end]);
    const rows = Array.from({ length: 1001 }, (_, i) => table === 'rounds' || table === 'quiz_rounds'
      ? { questions: [question(`${table} history ${i}`)] }
      : question(`${table} history ${i}`));
    return Promise.resolve({ data: rows.slice(start, end + 1) });
  } }; } }; } }; } };
  const history = await exports.loadUsedQuestions();
  for (const table of ['rounds', 'quiz_rounds', 'question_bank', 'questions']) {
    assert.ok(history.used.includes(`${table} history 1000`));
    assert.ok(calls.some(([name, start]) => name === table && start === 1000));
  }
});

test('a failed source cannot silently remove part of the saved history', async () => {
  for (const failed of ['rounds', 'question_bank', 'questions', 'quiz_rounds']) {
    database = { from(table) { return { select() { return { order() { return { range() {
      return Promise.resolve(table === failed ? { error: { message: 'offline' } } : { data: [] });
    } }; } }; } }; } };
    await assert.rejects(exports.loadUsedQuestions(), /Could not check saved/);
  }
});

test('rewording checks include questions older than the latest hundred', () => {
  const state = emptyExclusionState();
  state.used = ['Which scientist discovered penicillin?', ...Array.from({ length: 150 }, (_, i) => `Unrelated saved item ${i}`)];
  assert.ok(duplicateRejectionReason(question('Who discovered penicillin?', 'Fleming'), [], '', state));
});

test('the same fact is caught across answer formats and paraphrases', () => {
  const state = emptyExclusionState();
  state.historyQuestions = [{ ...question('Which city is the capital of France?', 'b', 'multiple_choice'), option_a: 'Rome', option_b: 'Paris' }];
  assert.equal(duplicateRejectionReason(question('Name the French capital in France.'), [], '', state), 'same-answer-and-subject:history');
  assert.equal(duplicateRejectionReason(question('Which Trojan prince judged the beauty contest?'), [], '', state), null);
});

test('punctuation and format changes cannot disguise an identical question', () => {
  const state = emptyExclusionState();
  state.used = ['Who wrote “Hamlet”?'];
  assert.ok(duplicateRejectionReason(question('Who wrote Hamlet!', 'Shakespeare', 'multiple_choice'), [], '', state));
});

test('database memory checks span text formats and fail closed on errors', async () => {
  let requestedType = 'not-called';
  database = { rpc: async (name, args) => { requestedType = args.p_type; return { data: 12 }; }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: question('Capital of France?') }) }) }) }) };
  assert.equal(await exports.isDuplicateInMemory(question('Capital of France?'), emptyExclusionState()), true);
  assert.equal(requestedType, null);
  database = { rpc: async () => ({ error: { message: 'offline' } }) };
  await assert.rejects(exports.isDuplicateInMemory(question('Capital of France?'), emptyExclusionState()), /history is unavailable/);
});

test('failed persistence cannot report an accepted question as remembered', async () => {
  database = { from() { return { upsert() { return { select() { return { maybeSingle: async () => ({ error: { message: 'write failed' } }) }; } }; } }; } };
  await assert.rejects(exports.commitToMemory(question('Capital of France?')), /Could not save question history/);
});


test('different flag facts survive shared vocabulary across the entire history', () => {
  const old = question('What colour is the flag of Portugal?', 'Red and green');
  const state = emptyExclusionState();
  registerAccepted(state, old);
  for (const [country, answer] of [['Japan', 'Red and white'], ['Sweden', 'Blue and yellow'], ['Ukraine', 'Yellow and blue'], ['Nigeria', 'Green and white']]) {
    assert.equal(duplicateRejectionReason(question(`What colour is the flag of ${country}?`, answer), [old], 'Flags', state), null);
  }
  assert.ok(duplicateRejectionReason(question('Name the colours appearing on Portugal’s national flag.', 'Red and green'), [], 'Flags', state));
});

test('a fuzzy database match for another flag is not a duplicate verdict', async () => {
  database = {
    rpc: async () => ({ data: 12 }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: question('What colour is the flag of Portugal?', 'Red and green') }) }) }) }),
  };
  assert.equal(await exports.isDuplicateInMemory(question('What colour is the flag of Sweden?', 'Blue and yellow'), emptyExclusionState()), false);
  assert.equal(await exports.isDuplicateInMemory(question('Name the colours of Portugal’s flag.', 'Red and green'), emptyExclusionState()), true);
});

test('shared picture-question stems do not make different flags duplicates', async () => {
  database = {
    rpc: async () => ({ data: 12 }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: question('Which country’s flag is this? (Portugal)', 'Portugal', 'picture') }) }) }) }),
  };
  assert.equal(await exports.isDuplicateInMemory(question('Which country’s flag is this?', 'Sweden', 'picture'), emptyExclusionState()), false);
  assert.equal(await exports.isDuplicateInMemory(question('Identify the national flag shown.', 'Portugal', 'picture'), emptyExclusionState()), true);
});

test('a common flag description and answer do not identify the same historical fact', () => {
  const state = emptyExclusionState();
  const previous = question('What colour is the circle on the white background of Japan’s flag?', 'Red');
  state.used = [previous.question_text];
  state.historyQuestions = [previous];
  assert.equal(duplicateRejectionReason(question('What colour is the circle on the green background of Bangladesh’s flag?', 'Red'), [], 'flag', state), null);
  assert.ok(duplicateRejectionReason(question('What colour circle appears on Japan’s national flag?', 'Red'), [], 'flag', state));
});

test('flag drafts reserve fresh countries rather than repeatedly asking for the same theme', () => {
  const state = emptyExclusionState();
  state.used = ['What colour is the flag of Portugal?', 'Which cross appears on Denmark’s flag?'];
  state.historyQuestions = [question('Identify this maple leaf flag.', 'Canada')];
  // Possessive wording is handled conservatively by also testing explicit names.
  state.usedAnswers.push('Denmark');
  const subjects = Array.from({ length: 18 }, () => exports.reserveFlagSubject('flag', state));
  assert.equal(new Set(subjects).size, 18);
  assert.ok(subjects.every(Boolean));
  assert.ok(!subjects.includes('Portugal'));
  assert.ok(!subjects.includes('Canada'));
  assert.ok(!subjects.includes('Denmark'));
  assert.equal(exports.reserveFlagSubject('flags of Asia', state), null);
  assert.equal(exports.reserveFlagSubject('Disney', state), null);
});


test('different facts may share a numeric answer across rounds but not within a round', () => {
  const state = emptyExclusionState();
  const previous = question('How many sides does a triangle have?', '3', 'number');
  registerAccepted(state, previous);
  const next = question('How many medals make a podium at the Olympics?', '3', 'number');
  assert.equal(duplicateRejectionReason(next, [], '', state), null);
  assert.equal(duplicateRejectionReason(next, [previous], '', state), 'same-answer:current-round');
  assert.ok(duplicateRejectionReason(question('How many sides has a triangle?', '3', 'number'), [], '', state));
});
