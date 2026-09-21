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
    state.used.length = 0; state.usedAnswers.length = 0; state.usedFingerprints.clear();
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
    if (table !== "quiz_rounds") return Promise.resolve({ data: [] });
    return { order() { return { range() { return Promise.resolve({ data: [{ questions: [pairs] }] }); } }; } };
  } }; } };
  const history = await exports.loadUsedQuestions();
  assert.ok(history.usedAnswers.includes("hammer + nail"));
  assert.ok(history.usedAnswers.includes("lock + key"));
  assert.equal(history.used.includes(undefined), false);
});

test("failed Quiz Plan history read does not silently generate repeated content", async () => {
  database = { from(table) { return { select() {
    if (table !== "quiz_rounds") return Promise.resolve({ data: [] });
    return { order() { return { range() { return Promise.resolve({ data: null, error: { message: "offline" } }); } }; } };
  } }; } };
  await assert.rejects(exports.loadUsedQuestions(), /Could not check saved Quiz Plans/);
});
