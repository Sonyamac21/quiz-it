// Run locally (needs real internet access + the project's ANTHROPIC_API_KEY):
//   cd ~/Desktop/quiz-it/_speedquizzing_import
//   node reviewSpeedQuizzingImport.mjs            # full run, all questions
//   node reviewSpeedQuizzingImport.mjs 200         # pilot run, first 200 only
//
// Reads speedquizzing_questions_export.csv (already sitting in this folder),
// sends questions to Claude in batches of 25 to get a topic tag + a
// stale-risk flag, and writes speedquizzing_questions_reviewed.csv next to
// it. Does not touch anything outside this folder, and makes no changes to
// your Quiz-It database - this is a read-a-file / write-a-file script only.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, "..", ".env.local");
const IN_CSV = path.join(__dirname, "speedquizzing_questions_export.csv");
const OUT_CSV = path.join(__dirname, "speedquizzing_questions_reviewed.csv");

const BATCH_SIZE = 25;
const MODEL = "claude-haiku-4-5-20251001";
const CONCURRENCY = 4; // parallel in-flight batch requests

function loadApiKey() {
  // An explicitly-exported ANTHROPIC_API_KEY in the shell always wins, so
  // you can override without editing .env.local:
  //   ANTHROPIC_API_KEY="sk-ant-..." node reviewSpeedQuizzingImport.mjs
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  const text = fs.readFileSync(ENV_PATH, "utf8");
  const line = text.split("\n").find(l => l.startsWith("ANTHROPIC_API_KEY="));
  if (!line) throw new Error("ANTHROPIC_API_KEY not found in .env.local");
  return line.slice("ANTHROPIC_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
}

// --- minimal CSV parser (handles quoted fields with commas/newlines) ---
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

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function writeCSV(rows, fields) {
  const lines = [fields.map(csvEscape).join(",")];
  for (const r of rows) lines.push(fields.map(f => csvEscape(r[f])).join(","));
  fs.writeFileSync(OUT_CSV, lines.join("\n"), "utf8");
}

const SYSTEM = `You are reviewing pub-quiz questions for a quiz-hosting app. For each question, do two things:
1. Assign ONE short topic tag from this fixed set (pick the closest match): Sport, Geography, History, Science & Nature, Music, Film & TV, Literature & Language, Food & Drink, General Knowledge, Current Affairs, Art & Culture.
2. Decide if the question is "stale-risk" - meaning its answer could plausibly have changed or become outdated since being written, or it references a specific, checkable point in time. Flag as stale-risk if it involves: current office-holders (presidents, PMs, CEOs, monarchs), "current"/"latest"/"reigning"/"youngest ever"/record-holder claims, someone's age or how long they've held a role, a sports season/champion/transfer, box office/chart/sales figures, a company's current size/valuation/ownership, or any phrase like "this year", "recently", "currently". Do NOT flag purely historical facts (e.g. "who directed Jaws in 1975") or evergreen trivia (capital cities, chemical symbols, classic literature) as stale-risk.

Respond with ONLY a JSON array, one object per question in the same order given, no prose:
[{"i": 0, "topic": "Sport", "stale": false, "reason": ""}, {"i": 1, "topic": "Current Affairs", "stale": true, "reason": "asks who currently holds the role"}]
"reason" should be under 10 words, empty string if stale is false.`;

async function callBatch(apiKey, items, attempt = 1) {
  const numbered = items.map(([q, a], idx) => `${idx}. Q: ${q}  A: ${a}`).join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: numbered }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429 && attempt <= 4) {
      await new Promise(r => setTimeout(r, 2000 * attempt));
      return callBatch(apiKey, items, attempt + 1);
    }
    throw new Error(`API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  let text = data.content?.[0]?.text?.trim() || "[]";
  text = text.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    console.error("  ! parse failure on batch, marking for manual review");
    return null;
  }
}

async function main() {
  const limitArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  const apiKey = loadApiKey();
  const raw = fs.readFileSync(IN_CSV, "utf8");
  let rows = parseCSV(raw);
  if (limitArg) rows = rows.slice(0, limitArg);

  console.log(`Reviewing ${rows.length} questions in batches of ${BATCH_SIZE}...`);

  const batches = [];
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    batches.push(rows.slice(start, start + BATCH_SIZE));
  }

  const results = new Array(rows.length).fill(null);
  let completed = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < batches.length) {
      const batchIndex = cursor++;
      const batch = batches[batchIndex];
      const offset = batchIndex * BATCH_SIZE;
      const items = batch.map(r => [r.question_text, r.answer]);
      let out;
      try {
        out = await callBatch(apiKey, items);
      } catch (e) {
        console.error(`  ! batch ${batchIndex} failed: ${e.message}`);
        out = null;
      }
      if (out) {
        for (const entry of out) {
          const idx = entry.i;
          if (typeof idx !== "number" || idx >= batch.length) continue;
          results[offset + idx] = {
            topic: entry.topic || "General Knowledge",
            stale: !!entry.stale,
            reason: entry.reason || "",
          };
        }
      }
      // fill any gaps for this batch with a manual-review fallback
      for (let j = 0; j < batch.length; j++) {
        if (!results[offset + j]) {
          results[offset + j] = { topic: "General Knowledge", stale: true, reason: "AI tagging failed - manual review" };
        }
      }
      completed += batch.length;
      if (batchIndex % 10 === 0) console.log(`  ${completed}/${rows.length} done`);
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  const outRows = rows.map((r, i) => ({
    ...r,
    topic: results[i].topic,
    stale_risk: results[i].stale ? "Yes" : "",
    stale_reason: results[i].reason,
  }));

  const fields = [...Object.keys(rows[0]), "topic", "stale_risk", "stale_reason"];
  writeCSV(outRows, fields);

  const staleCount = outRows.filter(r => r.stale_risk === "Yes").length;
  console.log(`\nDone. ${rows.length} rows -> ${OUT_CSV}`);
  console.log(`${staleCount} flagged stale-risk (${((staleCount / rows.length) * 100).toFixed(1)}%)`);
}

main().catch(e => { console.error(e); process.exit(1); });
