// Run once from the project root:
//   cd ~/Desktop/quiz-it
//   node _maintenance_scripts/flagOffWhitelistPictureQuestions.mjs
//
// The AI question generator restricts picture-type questions to subjects a
// stock photo site can actually carry: famous landmarks/buildings, animals,
// national flags, food/dishes, and sports stadiums (see PICTURE_TOPICS in
// lib/quiz/questionGenerationCore.ts). It deliberately excludes movie/TV
// characters, celebrities, logos/brands, and video games, because a site
// like Pixabay has no legitimate photos of copyrighted characters - a
// search for one only ever matches an unrelated photo that happens to share
// a tag (e.g. a Disneyland "Cars Land" landscape photo tagged "lightning
// mcqueen" for search visibility, with no actual car in the picture).
//
// That restriction only affects future AI generations. This script finds
// EXISTING picture questions already sitting in question_bank whose subject
// looks like it falls outside the whitelist - keyword-matched against the
// categories the generator prompt explicitly calls out as incompatible with
// real stock photography - and flags them needs_review=true with an
// explanatory note, so a host sees them on the Question Library's "Needs
// review" filter instead of the mismatched photo silently reaching players.
//
// Scope: only question_bank (the reusable saved-question library). It does
// NOT reach into already-built Quiz Plan rounds or Round Library rounds
// (their questions live as a JSON blob inside rounds.questions /
// quiz_rounds.questions, not as individual rows) - flagging those would mean
// rewriting JSON arrays in place across every round. Ask if you want that
// pass done too once you've seen how many turn up here.
//
// Does NOT delete or rewrite anything - flags only, and is a heuristic
// (keyword-based), not a guarantee: it will likely miss some off-whitelist
// questions and could occasionally flag a genuinely fine one (e.g. a dish
// question that happens to mention a film's name in passing) for a host to
// clear on review. Manually regenerate, reword, or convert to a different
// question type for anything you keep flagged.

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

// Signals for the categories the generator prompt explicitly excludes:
// movie/TV characters, celebrities, logos/brands, video games, artwork.
// Deliberately does NOT flag the allowed categories (landmarks, animals,
// flags, food/dishes, stadiums) even when they share incidental words.
const OFF_WHITELIST_SIGNALS = [
  /\bmain character\b/i,
  /\bcharacter\b/i,
  /\bappears in\b.*\b(film|movie|show|series|game)\b/i,
  /\b(film|movie)s?\b/i,
  /\btv (show|series)\b/i,
  /\bvideo game\b/i,
  /\bvoiced by\b/i,
  /\bplayed by\b/i,
  /\bactor\b/i,
  /\bactress\b/i,
  /\bsuperhero\b/i,
  /\bcelebrity\b/i,
  /\bbrand'?s? logo\b/i,
  /\blogo\b/i,
  /\bcartoon\b/i,
  /\banimated\b/i,
  /\bpixar\b/i,
  /\bdisney\b/i,
  /\bmarvel\b/i,
  /\bfranchise\b/i,
];

function looksOffWhitelist(text) {
  const value = text || "";
  return OFF_WHITELIST_SIGNALS.some(re => re.test(value));
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

  console.log("Scanning question_bank for picture questions outside the landmark/animal/flag/food/stadium whitelist...");
  let allPicture = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("question_bank")
      .select("id, question_text, option_a, correct_answer, needs_review, review_note")
      .eq("question_type", "picture")
      .range(from, from + PAGE - 1);
    if (error) { console.error("Fetch failed: " + error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    allPicture = allPicture.concat(data);
    if (data.length < PAGE) break;
  }
  console.log(`Checked ${allPicture.length} picture questions.`);

  const flagged = allPicture.filter(q => looksOffWhitelist(q.question_text) || looksOffWhitelist(q.option_a));
  console.log(`Found ${flagged.length} that look off-whitelist.`);
  if (flagged.length === 0) {
    console.log("Nothing to flag - done.");
    return;
  }

  const alreadyFlagged = flagged.filter(q => q.needs_review);
  const toFlag = flagged.filter(q => !q.needs_review);
  console.log(`  ${alreadyFlagged.length} already flagged needs_review - left alone.`);
  console.log(`  ${toFlag.length} newly flagging...`);

  const REVIEW_NOTE = "Picture subject looks like a movie/TV character, celebrity, logo/brand, or video game - stock photo sites (Pixabay) don't carry real photos of these, so the attached image is likely mismatched (e.g. tagged with the character's name but not actually showing them). Reword to a landmark/animal/flag/food/stadium subject, convert to a non-picture question type, or regenerate. Flagged by a one-off sweep.";

  let flaggedCount = 0, failed = 0;
  const examples = [];
  for (const q of toFlag) {
    const { error } = await supabase.from("question_bank")
      .update({ needs_review: true, review_note: REVIEW_NOTE })
      .eq("id", q.id);
    if (error) { failed++; console.error(`  ! failed to flag id ${q.id}: ${error.message}`); }
    else { flaggedCount++; if (examples.length < 15) examples.push(`    - "${q.question_text}" -> ${q.correct_answer}`); }
  }

  console.log(`\nDone. Flagged ${flaggedCount}, failed ${failed}.`);
  if (examples.length) {
    console.log("\nSample of newly flagged questions:");
    console.log(examples.join("\n"));
  }
  console.log("\nReview them at /host/question-bank with the \"Needs review\" filter.");
}

main().catch(e => { console.error(e); process.exit(1); });
