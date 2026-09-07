// Run once from the project root:
//   cd ~/Desktop/quiz-it
//   node _speedquizzing_import/retagNearestWins.mjs
//
// The original import merged SpeedQuizzing's "Nearest Wins" (closest-guess-
// wins) questions into the generic "number" (exact-match) type. That's
// wrong - Quiz-It's "number" type is deliberately exact-match-only
// (see lib/quiz/answerScoring.ts), and there's no proximity/closest-guess
// scoring anywhere in the app yet. This script retags those specific rows
// to question_type "nearest_wins" and marks them with a review_note
// explaining they need real gameplay support before they can be approved -
// they'll stay excluded from every selection path (manual, random, AI)
// exactly like any other needs_review row until that's built.
//
// Matches by exact question_text against the original SpeedQuizzing export
// (nearest_wins_texts.csv, sitting next to this script), scoped to rows
// still tagged question_type="number" with source="speedquizzing_import" -
// so it can never touch a hand-written or AI-generated Number question.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, "..", ".env.local");
const TEXTS_CSV = path.join(__dirname, "nearest_wins_texts.csv");

function loadEnv() {
  const text = fs.readFileSync(ENV_PATH, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\r") { /* skip */ }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter(r => r.length === header.length).map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const BATCH_SIZE = 50;

async function main() {
  const env = loadEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const rows = parseCSV(fs.readFileSync(TEXTS_CSV, "utf8"));
  const texts = rows.map(r => r.question_text).filter(Boolean);
  console.log(`Retagging up to ${texts.length} Nearest Wins questions...`);

  let matched = 0;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.from("question_bank")
      .update({
        question_type: "nearest_wins",
        review_note: "Nearest Wins - closest guess wins, not an exact match. Quiz-It has no proximity scoring yet; do not approve until that's built.",
      })
      .eq("question_type", "number")
      .eq("source", "speedquizzing_import")
      .in("question_text", batch)
      .select("id");
    if (error) { console.error(`  ! batch at ${i} failed: ${error.message}`); continue; }
    matched += (data || []).length;
    console.log(`  ${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length} processed, ${matched} matched so far`);
  }
  console.log(`\nDone. Retagged ${matched} rows from "number" to "nearest_wins".`);
}

main().catch(e => { console.error(e); process.exit(1); });
