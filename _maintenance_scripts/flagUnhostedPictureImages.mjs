// Run once from the project root:
//   cd ~/Desktop/quiz-it
//   node _maintenance_scripts/flagUnhostedPictureImages.mjs
//
// One-off sweep for the "picture question shows a broken image icon" bug:
// when a picture question is generated, its photo is meant to be re-hosted
// from Pixabay into this app's own permanent storage (Vercel Blob) via
// lib/quiz/persistPixabayImage.ts, because Pixabay's own hotlink URLs are
// NOT permanent and go dead over time (image pulled, CDN path rotated,
// etc). That re-host step has always silently fallen back to the original,
// temporary Pixabay URL if anything failed (network blip, upload error) -
// so some picture questions in the library have quietly been sitting on a
// URL that was always destined to break eventually, with no way to tell
// which ones from the app itself. That's exactly what's now showing up as
// broken image icons on already-saved questions.
//
// Going forward, lib/quiz/persistPixabayImage.ts now reports back whether
// the re-host actually succeeded, and the generation report will call out
// any question whose photo is still a temporary Pixabay link the moment
// it's generated - but that only helps NEW questions. This script finds
// picture questions ALREADY sitting in question_bank whose photo URL is
// not one of this app's own permanent storage URLs, and flags them with
// needs_review=true plus a review_note, so they surface on the Question
// Library's "Needs review" filter instead of silently staying in
// circulation until they happen to break on someone's screen.
//
// Scope: only question_bank (the reusable saved-question library). It does
// NOT reach into already-built Quiz Plan rounds or Round Library rounds
// (their questions live as a JSON blob inside rounds.questions /
// quiz_rounds.questions, not as individual rows) - those would need their
// own sweep. Ask if you want that done too once you've seen how many turn
// up here, since those rounds may already be attached to upcoming events.
//
// Does NOT delete, rewrite, or attempt to re-fetch/re-host anything itself
// (a maintenance script has no logged-in host session, and the re-host
// route requires one) - flags only. Review flagged rows on
// /host/question-bank (filter: Needs review) and either hit REGENERATE on
// each one (which re-runs the full picture pipeline, including a fresh
// re-host attempt while you're logged in) or delete/replace it.

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

// This app's own permanent storage - anything else (a raw pixabay.com /
// cdn.pixabay.com URL, or anything that isn't this domain) is a URL that
// was never durably re-hosted and can go dead at any time.
const PERMANENT_STORAGE_MARKER = "blob.vercel-storage.com";

async function main() {
  const env = loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("Scanning question_bank for picture questions without a permanently re-hosted image...");
  let allPicture = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("question_bank")
      .select("id, question_text, option_b, needs_review, review_note")
      .eq("question_type", "picture")
      .range(from, from + PAGE - 1);
    if (error) { console.error("Fetch failed: " + error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    allPicture = allPicture.concat(data);
    if (data.length < PAGE) break;
  }
  console.log(`Checked ${allPicture.length} picture questions.`);

  const isUnhosted = (q) => {
    const url = q.option_b || "";
    return !url || !url.includes(PERMANENT_STORAGE_MARKER);
  };

  const flagged = allPicture.filter(isUnhosted);
  console.log(`Found ${flagged.length} with a non-permanent (or missing) image URL.`);
  if (flagged.length === 0) {
    console.log("Nothing to flag - done.");
    return;
  }

  const alreadyFlagged = flagged.filter(q => q.needs_review);
  const toFlag = flagged.filter(q => !q.needs_review);
  console.log(`  ${alreadyFlagged.length} already flagged needs_review - left alone.`);
  console.log(`  ${toFlag.length} newly flagging...`);

  const REVIEW_NOTE = "Photo was never durably re-hosted (still a temporary Pixabay link, or missing entirely) - it may already be showing as a broken image, or could break later. Hit REGENERATE while logged in to fetch and permanently save a new photo, or delete/replace this question.";

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
