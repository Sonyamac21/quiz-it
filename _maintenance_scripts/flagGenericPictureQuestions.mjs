// Run once from the project root:
//   cd ~/Desktop/quiz-it
//   node _maintenance_scripts/flagGenericPictureQuestions.mjs
//
// One-off sweep for the "generic picture phrasing" bug just fixed in
// lib/quiz/generateRound.ts and app/host/questions/page.tsx: the AI prompt
// used to hand the model "Name this landmark" / "What animal is this?" as
// literal examples, which it then reproduced verbatim on question after
// question regardless of what was actually pictured. That fix only changes
// FUTURE generations - this script finds picture questions already sitting
// in question_bank with that same bare, no-detail phrasing and flags them
// with needs_review=true plus a review_note explaining why, so they surface
// on the Question Library's "Needs review" filter instead of silently
// staying in circulation.
//
// Scope: only question_bank (the reusable saved-question library). It does
// NOT reach into already-built Quiz Plan rounds or Round Library rounds
// (their questions live as a JSON blob inside rounds.questions /
// quiz_rounds.questions, not as individual rows) - flagging those would mean
// rewriting JSON arrays in place across every round, a bigger and riskier
// job than this sweep. Ask if you want that done too once you've seen how
// many turn up here.
//
// Does NOT delete or rewrite anything - flags only. You review flagged rows
// on /host/question-bank (filter: Needs review) and manually regenerate or
// reword the ones you want to keep using.

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

// Bare, no-detail generic forms - matched after trimming and stripping a
// trailing "?"/"." so "What animal is this?" / "what animal is this" /
// "What Animal Is This." all match the same way. Deliberately NOT matching
// the themed/specific forms the fixed prompt now requires (e.g. "Which
// country's flag is this?", "Which dish is pictured here?") - those are
// exactly the varied phrasing we want, not what's being flagged here.
const GENERIC_PATTERNS = [
  /^what is this$/i,
  /^what animal is this$/i,
  /^what bird is this$/i,
  /^what flag is this$/i,
  /^what landmark is this$/i,
  /^what dish is this$/i,
  /^what food is this$/i,
  /^what stadium is this$/i,
  /^name this landmark$/i,
  /^name this animal$/i,
  /^name this flag$/i,
  /^name this dish$/i,
  /^name this stadium$/i,
  /^what is shown here$/i,
  /^what is pictured here$/i,
];

function isGeneric(text) {
  const stripped = (text || "").trim().replace(/[?.]+$/, "");
  return GENERIC_PATTERNS.some(re => re.test(stripped));
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

  console.log("Scanning question_bank for picture questions with generic bare phrasing...");
  let allPicture = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("question_bank")
      .select("id, question_text, needs_review, review_note")
      .eq("question_type", "picture")
      .range(from, from + PAGE - 1);
    if (error) { console.error("Fetch failed: " + error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    allPicture = allPicture.concat(data);
    if (data.length < PAGE) break;
  }
  console.log(`Checked ${allPicture.length} picture questions.`);

  const flagged = allPicture.filter(q => isGeneric(q.question_text));
  console.log(`Found ${flagged.length} with generic bare phrasing.`);
  if (flagged.length === 0) {
    console.log("Nothing to flag - done.");
    return;
  }

  const alreadyFlagged = flagged.filter(q => q.needs_review);
  const toFlag = flagged.filter(q => !q.needs_review);
  console.log(`  ${alreadyFlagged.length} already flagged needs_review - left alone.`);
  console.log(`  ${toFlag.length} newly flagging...`);

  const REVIEW_NOTE = "Generic picture phrasing (e.g. \"What animal is this?\" with no other detail) - reword to be specific to the subject shown, or regenerate. Flagged by a one-off sweep after fixing the AI prompt that used to cause this.";

  let flaggedCount = 0, failed = 0;
  for (const q of toFlag) {
    const { error } = await supabase.from("question_bank")
      .update({ needs_review: true, review_note: REVIEW_NOTE })
      .eq("id", q.id);
    if (error) { failed++; console.error(`  ! failed to flag id ${q.id}: ${error.message}`); }
    else flaggedCount++;
  }

  console.log(`\nDone. Flagged ${flaggedCount}, failed ${failed}.`);
  console.log("Review them at /host/question-bank with the \"Needs review\" filter.");
}

main().catch(e => { console.error(e); process.exit(1); });
