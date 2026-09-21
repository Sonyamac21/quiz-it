// Run once from the project root:
//   cd ~/Desktop/quiz-it
//   node _speedquizzing_import/applyNearestWinsRewrite2.mjs --dry-run
//   node _speedquizzing_import/applyNearestWinsRewrite2.mjs
//
// Follow-up to applyNearestWinsRewrite.mjs. That script matched CSV rows to
// question_bank rows by exact question_text equality and only matched 134 of
// 209 - the other 75 have question_text in the DB that differs slightly from
// nearest_wins_rewritten.csv's question_text_original (curly vs straight
// quotes, collapsed whitespace, etc - the CSV was built from the raw
// SpeedQuizzing export text, not read back from question_bank itself).
//
// This script fetches every question_bank row for
// question_type=nearest_wins + source=speedquizzing_import, matches CSV rows
// to them by NORMALIZED text (trim, collapse whitespace, unify quote/dash
// characters, casefold) instead of exact equality, and updates by id. It
// skips any row already handled (question_text already equals the target
// rewrite, or already needs_review=true with the expected note) so it's safe
// to run after the first script without double-applying.
//
// Any CSV row that still can't be matched after normalization is printed in
// full (not truncated) at the end for manual investigation - that means the
// text actually diverges in content, not just formatting, and needs a human
// look before touching it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, "..", ".env.local");
const CSV_PATH = path.join(__dirname, "nearest_wins_rewritten.csv");
const DRY_RUN = process.argv.includes("--dry-run");

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

function normalize(s) {
  return (s || "")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const csvText = fs.readFileSync(CSV_PATH, "utf8");
  const rows = parseCSV(csvText);

  const { data: dbRows, error: fetchError } = await supabase.from("question_bank")
    .select("id, question_text, needs_review, review_note")
    .eq("question_type", "nearest_wins")
    .eq("source", "speedquizzing_import");
  if (fetchError) { console.error("Fetch failed: " + fetchError.message); process.exit(1); }
  console.log(`Fetched ${dbRows.length} question_bank rows to match against.`);

  const byNorm = new Map();
  for (const dbRow of dbRows) {
    const key = normalize(dbRow.question_text);
    if (!byNorm.has(key)) byNorm.set(key, []);
    byNorm.get(key).push(dbRow);
  }

  let rewritten = 0, alreadyDone = 0, flagged = 0, alreadyFlagged = 0;
  const unmatched = [];

  for (const r of rows) {
    const isRewrite = !!(r.question_text_rewritten && r.question_text_rewritten.trim());

    // A row a prior run already rewrote now has question_text == the target
    // rewrite, not the original - so check that first, or it'd wrongly show
    // up as "unmatched" just because the original text no longer exists.
    if (isRewrite) {
      const already = byNorm.get(normalize(r.question_text_rewritten));
      if (already && already.length >= 1) { alreadyDone += already.length; continue; }
    }

    const matches = byNorm.get(normalize(r.question_text_original));
    if (!matches || matches.length === 0) { unmatched.push(r); continue; }
    if (matches.length > 1) {
      console.warn(`Ambiguous: ${matches.length} DB rows normalize to the same text as "${r.question_text_original.slice(0, 60)}..." - skipping, needs manual review.`);
      unmatched.push(r);
      continue;
    }
    const dbRow = matches[0];

    if (isRewrite) {
      if (DRY_RUN) { rewritten++; continue; }
      const { error } = await supabase.from("question_bank")
        .update({ question_text: r.question_text_rewritten })
        .eq("id", dbRow.id);
      if (error) { console.error(`Rewrite failed for id ${dbRow.id}: ${error.message}`); continue; }
      rewritten++;
    } else {
      const note = `SpeedQuizzing import: original was a picture-round question, no image available, and text alone can't stand in for it (${r.flag || "unresolvable without the image"}).`;
      if (dbRow.needs_review === true) { alreadyFlagged++; continue; }
      if (DRY_RUN) { flagged++; continue; }
      const { error } = await supabase.from("question_bank")
        .update({ needs_review: true, review_note: note })
        .eq("id", dbRow.id);
      if (error) { console.error(`Flag failed for id ${dbRow.id}: ${error.message}`); continue; }
      flagged++;
    }
  }

  console.log(`${DRY_RUN ? "[DRY RUN] Would rewrite" : "Rewrote"} ${rewritten} question(s) (${alreadyDone} already matched target text).`);
  console.log(`${DRY_RUN ? "[DRY RUN] Would re-flag" : "Re-flagged"} ${flagged} question(s) (${alreadyFlagged} already flagged).`);
  if (unmatched.length) {
    console.log(`\n${unmatched.length} row(s) still unmatched after normalization - content actually differs, needs a manual look:\n`);
    for (const r of unmatched) console.log(`- ${r.question_text_original}`);
  } else {
    console.log("All CSV rows matched.");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
