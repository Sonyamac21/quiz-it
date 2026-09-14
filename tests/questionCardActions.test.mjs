import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/host/quizzes/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("round-prep actions remain above the expanded hover preview", () => {
  assert.match(page, /className="qi-prep-question-preview"/);
  const actions = page.slice(page.indexOf('className="qi-prep-question-actions"'));
  assert.match(actions, />EDIT<\/HostButton>/);
  assert.match(actions, />\{isSwapping \? "REGENERATING\.\.\." : "REGENERATE"\}<\/HostButton>/);
  assert.match(css, /\.qi-prep-question-actions\s*\{[^}]*position:relative;[^}]*z-index:42;/s);
  assert.match(page, /qi-prep-question-preview[\s\S]{0,350}zIndex: 40/);
});
