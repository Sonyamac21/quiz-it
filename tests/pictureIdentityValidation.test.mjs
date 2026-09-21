import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const core = readFileSync(new URL("../lib/quiz/questionGenerationCore.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/generate-questions/route.ts", import.meta.url), "utf8");

test("generated picture questions receive a visual identity check before persistence", () => {
  const visualCheck = core.indexOf("await checkPictureIdentity(q, pixabayUrl)");
  const persistence = core.indexOf("await persistPixabayImage(pixabayUrl)");
  assert.ok(visualCheck > -1 && persistence > visualCheck);
  assert.match(core, /an image intended as Pad Thai must visibly be Pad Thai/);
});

test("the authenticated generation route accepts only secure Pixabay vision URLs", () => {
  assert.match(route, /parsed\.protocol !== "https:" \|\| !isPixabay/);
  assert.match(route, /type: "image", source: \{ type: "base64", media_type: imageMediaType, data: imageData \}/);
  assert.match(route, /AbortSignal\.timeout\(8000\)/);
  assert.match(route, /size > 5 \* 1024 \* 1024/);
  assert.match(route, /status: 422/);
});
