// Run once from the project root:
//   cd ~/Desktop/quiz-it
//   node _speedquizzing_import/bulkApproveImported.mjs
//
// The AI review pass already tagged topics and excluded stale-risk
// questions at import time - "needs_review" was a second, manual approval
// gate on top of that. Given the AI already did the staleness check,
// clicking through 35,000 questions by hand is redundant. This approves
// everything already imported in one shot.
//
// Deliberately EXCLUDES question_type = "nearest_wins" - those aren't
// stuck pending human review, they're stuck because Quiz-It has no
// closest-guess scoring mechanic yet (see retagNearestWins.mjs). Approving
// them would make them pickable into a live round where they'd play
// incorrectly (exact-match scoring against a "closest wins" question).
// They'll stay needs_review=true until that feature actually exists.

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
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const { count: before } = await supabase.from("question_bank").select("id", { count: "exact", head: true })
    .eq("needs_review", true).in("source", ["speedquizzing_import", "speedquizzing_multitap_import"]).neq("question_type", "nearest_wins");
  console.log(`Approving ${before ?? "an unknown number of"} imported questions (excluding Nearest Wins)...`);

  const { error, count } = await supabase.from("question_bank")
    .update({ needs_review: false }, { count: "exact" })
    .eq("needs_review", true)
    .in("source", ["speedquizzing_import", "speedquizzing_multitap_import"])
    .neq("question_type", "nearest_wins");

  if (error) { console.error("Bulk approve failed: " + error.message); process.exit(1); }
  console.log(`Done. Approved ${count ?? before ?? "?"} questions. They're now pickable in Quiz Plans and Random From Library.`);

  const { count: stillPending } = await supabase.from("question_bank").select("id", { count: "exact", head: true }).eq("needs_review", true);
  console.log(`Still needs_review (Nearest Wins, held back for gameplay support): ${stillPending ?? 0}`);
}

main().catch(e => { console.error(e); process.exit(1); });
