// Run once from the project root:
//   cd ~/Desktop/quiz-it
//   node _speedquizzing_import/approveNearestWins.mjs
//
// bulkApproveImported.mjs deliberately EXCLUDED question_type="nearest_wins"
// rows, because at the time Quiz-It had no closest-guess scoring mechanic -
// approving them would have made them pickable into a live round where
// they'd have played incorrectly (exact-match scoring against a "closest
// wins" question). See retagNearestWins.mjs for the full history of how
// these 439 rows got tagged and held back.
//
// That gameplay support now exists (tapered-by-rank scoring, numeric
// keypad, closest-guess reveal - see lib/quiz/answerScoring.ts and
// components/PlayerQuizScreen.tsx), so this approves that specific
// held-back batch. Scoped narrowly to question_type="nearest_wins" AND
// source="speedquizzing_import" so it can never touch a hand-written or
// AI-generated question that happens to also be needs_review for some
// unrelated reason.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, "..", ".env.local");

function loadEnv() {
  const text = fs.readFileSync(ENV_PATH, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
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

  const { count: before, error: countError } = await supabase.from("question_bank")
    .select("id", { count: "exact", head: true })
    .eq("question_type", "nearest_wins")
    .eq("source", "speedquizzing_import")
    .eq("needs_review", true);
  if (countError) { console.error("Count failed: " + countError.message); process.exit(1); }
  console.log(`Approving ${before ?? "an unknown number of"} Nearest Wins questions now that closest-guess scoring is built...`);

  if (!before) {
    console.log("Nothing to approve - done.");
    return;
  }

  const { error, count } = await supabase.from("question_bank")
    .update({
      needs_review: false,
      review_note: null,
    }, { count: "exact" })
    .eq("question_type", "nearest_wins")
    .eq("source", "speedquizzing_import")
    .eq("needs_review", true);

  if (error) { console.error("Approve failed: " + error.message); process.exit(1); }
  console.log(`Done. Approved ${count ?? before} Nearest Wins questions. They're now pickable in Quiz Plans, Random From Library, and the manual "+ FROM LIBRARY" picker.`);
}

main().catch(e => { console.error(e); process.exit(1); });
