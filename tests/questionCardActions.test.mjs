import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/host/quizzes/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("round-prep hover preview contains its actions below the scrollable full question", () => {
  assert.match(page, /className="qi-prep-question-preview"/);
  assert.match(page, /const questionActions = \([\s\S]*>EDIT<\/HostButton>[\s\S]*"REGEN"/);
  assert.match(page, /qi-prep-question-preview__body">\{cardBody\}<\/div>[\s\S]{0,100}\{questionActions\}/);
  assert.match(page, /!isCardHovered && questionActions/);
  assert.match(css, /\.qi-prep-question-preview\s*\{[^}]*display:flex;[^}]*flex-direction:column;[^}]*overflow:hidden;/s);
  assert.match(css, /\.qi-prep-question-preview__body\s*\{[^}]*overflow-y:auto;/s);
});
