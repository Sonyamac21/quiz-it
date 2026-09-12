import test from "node:test";
import assert from "node:assert/strict";

import { clearPendingManualAdjustment, loadPendingManualAdjustment, savePendingManualAdjustment } from "../lib/quiz/manualAdjustment.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test("manual adjustment keeps the same event key across a page reload", () => {
  const storage = memoryStorage();
  const pending = { pin: "1234", team: "Jazz", delta: 5, eventKey: "manual:1234:fixed" };
  savePendingManualAdjustment(storage, pending);
  assert.deepEqual(loadPendingManualAdjustment(storage), pending);
});

test("confirmed manual adjustment clears reload recovery state", () => {
  const storage = memoryStorage();
  savePendingManualAdjustment(storage, { pin: "1234", team: "Jazz", delta: -5, eventKey: "manual:1234:fixed" });
  clearPendingManualAdjustment(storage);
  assert.equal(loadPendingManualAdjustment(storage), null);
});

test("corrupt recovery state is ignored", () => {
  const storage = memoryStorage();
  storage.setItem("quiz-it:pending-manual-adjustment", "not-json");
  assert.equal(loadPendingManualAdjustment(storage), null);
});

test("unavailable browser storage does not break score adjustment handling", () => {
  const blockedStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  const pending = { pin: "1234", team: "Jazz", delta: 5, eventKey: "manual:1234:fixed" };
  assert.doesNotThrow(() => savePendingManualAdjustment(blockedStorage, pending));
  assert.equal(loadPendingManualAdjustment(blockedStorage), null);
  assert.doesNotThrow(() => clearPendingManualAdjustment(blockedStorage));
});
