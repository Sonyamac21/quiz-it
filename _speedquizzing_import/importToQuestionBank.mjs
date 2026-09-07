// Run locally, from the quiz-it project (so it can reuse node_modules):
//   cd ~/Desktop/quiz-it
//   node _speedquizzing_import/importToQuestionBank.mjs
//
// Reads speedquizzing_questions_reviewed.csv (produced by
// reviewSpeedQuizzingImport.mjs) and inserts every NON-stale-flagged
// question into question_bank, tagged needs_review=true and
// source="speedquizzing_import" so nothing is selectable in a live quiz
// until you (or a later pass) approve individual rows.
//
// Anything with stale_risk = "Yes" is skipped entirely - per Sonya's
// instruction, stale questions are not imported at all, not even flagged.
//
// Requires the two new columns from
// supabase/migrations/202609070002_question_bank_import_columns.sql to
// already be applied to the live database, or every insert will fail.
//
// Uses the project's normal NEXT_PUBLIC_SUPABASE_ANON_KEY from .env.local.
// If inserts get rejected by row-level security, you'll see that clearly
// in the error output below - see the comment at the bottom of this file
// for what to do in that case.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, "..", ".env.local");
const IN_CSV = path.join(__dirname, "speedquizzing_questions_reviewed.csv");
const REPORT_PATH = path.join(__dirname, "import_report.csv");

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
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
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

const BATCH_SIZE = 200;

async function main() {
  if (!fs.existsSync(IN_CSV)) {
    console.error(`Missing ${IN_CSV} - run reviewSpeedQuizzingImport.mjs first (the full run, not the pilot).`);
    process.exit(1);
  }
  const env = loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const raw = fs.readFileSync(IN_CSV, "utf8");
  const rows = parseCSV(raw);
  console.log(`Read ${rows.length} reviewed questions.`);

  const skippedStale = rows.filter(r => r.stale_risk === "Yes");
  const toImport = rows.filter(r => r.stale_risk !== "Yes");
  console.log(`Skipping ${skippedStale.length} stale-flagged questions (not imported at all).`);
  console.log(`Importing ${toImport.length} questions as needs_review...`);

  const payload = toImport.map(r => ({
    question_text: r.question_text,
    question_type: r.question_type,
    correct_answer: r.answer,
    option_a: r.option_a || null,
    option_b: r.option_b || null,
    option_c: r.option_c || null,
    option_d: r.option_d || null,
    option_e: null,
    option_f: null,
    difficulty: "mixed",
    round_type: null, // library questions are reusable across round types - see loadLibraryQuestions() in app/host/quizzes/page.tsx
    topic: r.topic || null,
    source: "speedquizzing_import",
    needs_review: true,
    stale_risk: false,
    review_note: r.has_picture === "True" ? "Has a picture in the original - image not yet imported, needs a picture attached before use." : null,
  }));

  let inserted = 0, failed = 0;
  const failures = [];
  for (let start = 0; start < payload.length; start += BATCH_SIZE) {
    const chunk = payload.slice(start, start + BATCH_SIZE);
    const { error } = await supabase.from("question_bank").insert(chunk);
    if (error) {
      failed += chunk.length;
      failures.push({ batchStart: start, error: error.message });
      console.error(`  ! batch at row ${start} failed: ${error.message}`);
    } else {
      inserted += chunk.length;
    }
    if ((start / BATCH_SIZE) % 10 === 0) console.log(`  ${start + chunk.length}/${payload.length} processed`);
  }

  const reportLines = ["status,count"];
  reportLines.push(`imported,${inserted}`);
  reportLines.push(`failed,${failed}`);
  reportLines.push(`skipped_stale,${skippedStale.length}`);
  fs.writeFileSync(REPORT_PATH, reportLines.join("\n"));

  console.log(`\nDone. Imported ${inserted}, failed ${failed}, skipped (stale) ${skippedStale.length}.`);
  if (failures.length) {
    console.log("\nIf every batch failed with a permissions/policy error, row-level security is blocking");
    console.log("anonymous inserts into question_bank. In that case, run this script with a Supabase");
    console.log("service-role key instead: get it from Supabase dashboard > Project Settings > API >");
    console.log("service_role secret, then run:");
    console.log('  SUPABASE_SERVICE_ROLE_KEY="..." node _speedquizzing_import/importToQuestionBank.mjs');
    console.log("(this script does not currently read that variable - tell Claude if you hit this and it'll be wired in).");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
