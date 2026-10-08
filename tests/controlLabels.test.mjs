import test from "node:test";
import assert from "node:assert/strict";
import { friendlyControlLabel } from "../lib/ui/controlLabels.ts";

test("shared controls use clear action labels", () => {
  assert.equal(friendlyControlLabel("REGEN"), "Replace question");
  assert.equal(friendlyControlLabel("TO LIBRARY"), "Save to library");
  assert.equal(friendlyControlLabel("+ GENERATE WITH AI"), "Generate questions");
});

test("presentation changes leave answer keys and user content untouched", () => {
  for (const label of ["A", "B", "NASA", "TEAM AWESOME", "Who wrote Hamlet?", "42", "Liza Miller"]) {
    assert.equal(friendlyControlLabel(label), label);
  }
});
