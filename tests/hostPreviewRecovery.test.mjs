import test from "node:test";
import assert from "node:assert/strict";
import { clearHostPreviewRecovery, loadHostPreviewRecovery, saveHostPreviewRecovery } from "../lib/quiz/hostPreviewRecovery.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test("question preview identity survives a host-tab reload", () => {
  const storage = memoryStorage();
  const preview = { sessionId: "session", roundId: "round", questionIndex: 4 };
  saveHostPreviewRecovery(storage, preview);
  assert.deepEqual(loadHostPreviewRecovery(storage), preview);
  clearHostPreviewRecovery(storage);
  assert.equal(loadHostPreviewRecovery(storage), null);
});

test("invalid preview recovery data is ignored", () => {
  const storage = memoryStorage();
  storage.setItem("quiz-it:host-preview-recovery", "{bad json");
  assert.equal(loadHostPreviewRecovery(storage), null);
});
