import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const join = readFileSync(new URL("../app/join/page.tsx", import.meta.url), "utf8");

test("the NFC/public root opens the PIN join screen directly", () => {
  assert.match(home, /import \{ redirect \} from "next\/navigation"/);
  assert.match(home, /redirect\("\/join"\)/);
  assert.doesNotMatch(home, /Host sign in|Host a quiz/);
  assert.match(join, /<JoinForm \/>/);
});
