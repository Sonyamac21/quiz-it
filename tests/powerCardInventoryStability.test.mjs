import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../components/UnoCards.tsx", import.meta.url), "utf8");

test("power-card inventory cannot flash back to all available between handset phases", () => {
  assert.match(source, /const usedCardsCache = new Map<string, string\[\]>\(\)/);
  assert.match(source, /useState\(\(\) => usedCardsCache\.has\(inventoryKey\)\)/);
  assert.match(source, /if \(!inventoryReady\) \{[\s\S]*?CHECKING YOUR POWER CARDS/);
  assert.match(source, /usedCardsCache\.set\(inventoryKey, next\)/);
});

test("a failed inventory read retries without exposing unverified cards", () => {
  assert.match(source, /if \(error\) \{[\s\S]*?retryTimer = setTimeout\(refetch, 2000\)/);
  assert.doesNotMatch(source, /if \(error\)[\s\S]{0,160}setInventoryReady\(true\)/);
});
