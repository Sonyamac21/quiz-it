import { PairRecord } from "@/lib/quiz/pairs";
import { buildPixabaySearchQuery, selectMatchingPixabayHit } from "@/lib/quiz/pixabayMatch";
import { persistPixabayImage } from "@/lib/quiz/persistPixabayImage";
import { callAPI, checkPictureIdentity, ExclusionState, fetchWithTimeout, GENERATION_MODEL, VALIDATION_MODEL } from "@/lib/quiz/questionGenerationCore";

type DraftPair = { pair_id?: string; a?: { label?: string; image_query?: string }; b?: { label?: string; image_query?: string } };

// Bug: this used to grab from the FIRST "[" to the LAST "]" in the whole
// response text. That works only when the array is the entire response -
// but the model sometimes appends a trailing note after the array (or the
// array itself contains a value with a stray "]" character), and
// lastIndexOf then swallows that trailing text into the "JSON", producing
// exactly the live failure reported: "Unexpected non-whitespace character
// after JSON at position 645 (line 38 column 1)" - valid JSON followed by
// leftover text that was never supposed to be part of it. This instead
// walks forward from the first "[" tracking bracket depth (skipping over
// quoted strings, so a "]" inside a label/query string doesn't miscount)
// and stops at the bracket that actually closes the array, ignoring
// anything after it.
function parseArray(text: string): DraftPair[] {
  const start = text.indexOf("[");
  if (start < 0) throw new Error("Pairs generator returned invalid JSON: no array found");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") { inString = true; continue; }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1)) as DraftPair[];
    }
  }
  throw new Error("Pairs generator returned invalid JSON: no matching closing bracket");
}

async function sourceImage(query: string, label: string): Promise<string> {
  const key = process.env.NEXT_PUBLIC_PIXABAY_API_KEY;
  if (!key) throw new Error("Pixabay is not configured");
  const search = buildPixabaySearchQuery(query);
  // Widened from 8 to 20 - selectMatchingPixabayHit now picks randomly among
  // the top few qualifying matches rather than always the single best one,
  // and a pool of 8 usually only had one or two hits that actually cleared
  // the relevance threshold, leaving nothing to vary between.
  // Previously a plain fetch with no timeout - unlike every AI call in this
  // pipeline (callAPI/checkPictureIdentity), a stalled connection to
  // Pixabay's search endpoint here hung the whole Match Made generation
  // indefinitely with the progress text frozen on "Creating Match Made
  // question X of Y..." and no way to recover short of reloading the page.
  const response = await fetchWithTimeout(`https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(search)}&image_type=photo&per_page=20&safesearch=true`);
  if (!response.ok) throw new Error("Picture search failed");
  const data = await response.json();
  let candidates = Array.isArray(data?.hits) ? data.hits : [];
  let reason = `No suitable picture found for ${label}`;
  // Raised from 3 to 5 - a pool of 20 Pixabay candidates often has several
  // that look plausible from the search query alone but fail the stricter
  // identity check (a set of pots shown when the label needs one clear
  // bowl, say); 3 attempts burned through the closest matches too fast on
  // some labels and gave up before reaching a genuinely clean shot further
  // down the ranked list.
  for (let attempt = 0; attempt < 5; attempt++) {
    const hit = selectMatchingPixabayHit(candidates, query, label);
    const source = hit?.webformatURL || hit?.largeImageURL;
    if (!hit || !source) break;
    candidates = candidates.filter((candidate: { webformatURL?: string; largeImageURL?: string }) => (candidate.webformatURL || candidate.largeImageURL) !== source);
    // Match Made needs 6 verified images per question (3 pairs x 2), so this
    // vision call happens far more often per question than for a normal
    // picture question - it was the single biggest cost driver in host
    // reports of ~10-20c per Match Made question. Haiku (VALIDATION_MODEL,
    // already used for the text-generation step) is a fraction of Sonnet's
    // cost for the same yes/no visual check; picture questions elsewhere in
    // the app are unaffected and keep the pricier default.
    const verdict = await checkPictureIdentity({ question_text: `Identify the ${label} in this picture.`, question_type: "picture", option_a: label, option_b: null, option_c: null, option_d: null, option_e: null, option_f: null, correct_answer: label, explanation: "", difficulty: "mixed", round_type: "pairs" }, source, VALIDATION_MODEL);
    if (!verdict.ok) { reason = verdict.note; continue; }
    // Bug: persistPixabayImage's own design (see its file comment) is to
    // fall back to the original Pixabay URL when the re-host step fails,
    // on the reasoning that a hotlinked image today beats no question at
    // all. Throwing here on `!saved.persisted` overrode that and discarded
    // an image that had ALREADY passed the vision identity check - a real
    // network hiccup on the re-host step (not the picture itself) burned an
    // entire verified-good candidate and one more expensive retry for no
    // reason. Accept saved.url either way; it is always a usable image.
    const saved = await persistPixabayImage(source);
    return saved.url;
  }
  throw new Error(reason);
}

export async function generatePairs(count: number, theme: string, exclusions: ExclusionState): Promise<PairRecord[]> {
  const avoid = [...exclusions.used.slice(-120), ...exclusions.usedAnswers.slice(-120)].join(" | ").slice(0, 7000);
  const prompt = `Create ${count} distinct odd-couple picture pairs for a commercial pub quiz Pairs round.${theme.trim() ? ` Theme: ${theme.trim()}.` : " Use broad, internationally accessible general knowledge."}
Each pair contains two DIFFERENT concrete things that naturally go together conceptually (examples of the relationship only: lock + key, needle + thread). Do not copy those examples. Do not create visually identical objects, two people, brands, logos, flags, copyrighted characters, wordplay, region-specific slang, abstract ideas, or a pair whose relationship is debatable. Each item must be a complete, whole physical object, clearly recognisable in one ordinary full-object stock photograph and instantly distinguishable on a phone - never something identifiable only via an extreme close-up, texture or pattern (fingerprint, retina, DNA strand, snowflake). Avoid items with several visually different real-world versions where a generic stock photo search returns inconsistent results - e.g. medical/safety equipment (oxygen mask, inhaler, gas mask), generic tools, or anything more commonly shown as a diagram/illustration than a real photograph. Favour single, visually consistent everyday objects instead (teapot, umbrella, guitar, bicycle). Use a different relationship and subject area for every pair. Avoid overused facts or content already seen here: ${avoid || "none supplied"}.
Return ONLY a JSON array. Every item must be exactly {"pair_id":"p1","a":{"label":"short visible label","image_query":"precise English stock-photo search"},"b":{"label":"short visible label","image_query":"precise English stock-photo search"}}. No markdown or explanation.`;
  const records: PairRecord[] = [];
  const seen = new Set<string>();
  const failures: string[] = [];
  const attemptedLabels = new Set<string>();
  let attempts = 0;
  let duplicateSkips = 0;
  let drafts: DraftPair[] = [];
  // Raised from 4 to 8 batches - a themed or less common request can burn
  // through several batches of otherwise-good pair ideas before finding
  // ones whose images clear the identity check, and 4 was giving up on
  // legitimately gettable questions rather than a genuinely exhausted
  // theme. Each failed batch is cheap (one AI call + already-rejected image
  // fetches, both now timeout-protected), so this just gives it more real
  // chances rather than more time wasted hanging.
  for (let attempt = 0; attempt < 8 && records.length < count; attempt++) {
    attempts++;
    const needed = count - records.length;
    const batch = parseArray(await callAPI(prompt.replace(`Create ${count} distinct`, `Create ${Math.min(needed + 2, 6)} distinct`) + `\nDo not reuse these already attempted items (including failed images): ${[...attemptedLabels].join(", ")}.`, 1800, false, false, GENERATION_MODEL)).slice(0, needed + 2);
    drafts = drafts.concat(batch);
    for (let index = 0; index < batch.length && records.length < count; index++) {
    const draft = batch[index];
    if (!draft || typeof draft !== "object") continue;
    const aLabel = typeof draft.a?.label === "string" ? draft.a.label.trim() : "";
    const bLabel = typeof draft.b?.label === "string" ? draft.b.label.trim() : "";
    const aQuery = typeof draft.a?.image_query === "string" ? draft.a.image_query.trim() : "";
    const bQuery = typeof draft.b?.image_query === "string" ? draft.b.image_query.trim() : "";
    if (!aLabel || !bLabel || !aQuery || !bQuery || aLabel.toLowerCase() === bLabel.toLowerCase()) continue;
    // Bug: this used to be `prior.some(value => value.includes(aLabel...))` -
    // a SUBSTRING check against every pair fingerprint ever recorded, with no
    // limit on how far back it looked. Match Made's whole item space is
    // ordinary household objects (there are only so many of those), so once
    // "eraser" or "egg" had appeared in ANY past pair, anywhere in this
    // account's entire generation history, that one substring match
    // permanently blocked every future candidate whose label merely
    // contained it - "Egg" blocked forever by a long-past "boiled egg +
    // toast" pair, even in an unrelated theme months later. That's what was
    // producing "Found 2 after 8 batches (31 candidates)... Try a broader
    // theme" with zero real image failures logged: every candidate was being
    // silently discarded here, before ever reaching an image search. Now it
    // only blocks an EXACT label match (case-insensitive) and only within a
    // recent window, so a genuinely fresh idea that happens to share a
    // common word with old history is no longer collateral damage.
    const recentPriorLabels = new Set(
      exclusions.usedAnswers.filter(value => typeof value === "string").slice(-300)
        .flatMap(value => value.toLowerCase().split(" + "))
    );
    if (attemptedLabels.has(aLabel.toLowerCase()) || attemptedLabels.has(bLabel.toLowerCase())
      || recentPriorLabels.has(aLabel.toLowerCase()) || recentPriorLabels.has(bLabel.toLowerCase())) { duplicateSkips++; continue; }
    attemptedLabels.add(aLabel.toLowerCase());
    attemptedLabels.add(bLabel.toLowerCase());
    const fingerprint = [aLabel, bLabel].map(value => value.toLowerCase()).sort().join(" + ");
    if (seen.has(fingerprint) || exclusions.used.slice(-300).some(value => String(value || "").toLowerCase() === fingerprint)) { duplicateSkips++; continue; }
    seen.add(fingerprint);
    try {
      // Deliberately reuse the exact Pixabay matching + permanent re-hosting
      // helpers used by picture questions; Pairs has no second media path.
      const [aImage, bImage] = await Promise.all([sourceImage(aQuery, aLabel), sourceImage(bQuery, bLabel)]);
      records.push({ pair_id: `p${records.length + 1}`, question_type: "pairs", round_type: "pairs", a: { label: aLabel, image_url: aImage }, b: { label: bLabel, image_url: bImage } });
      exclusions.used.push(`${aLabel} + ${bLabel}`);
      exclusions.usedAnswers.push(fingerprint);
    } catch (error) {
      // A missing or misleading stock image rejects the whole pair rather
      // than saving a half-built round the host cannot play.
      failures.push(error instanceof Error ? error.message : "image validation failed");
    }
    }
  }
  if (records.length !== count) {
    const reason = failures[0] || (duplicateSkips > 0 ? `${duplicateSkips} of ${drafts.length} candidates were skipped as repeats of earlier pairs - try a broader theme.` : "Try a broader theme.");
    throw new Error(`Match Made needs ${count} complete pairs. Found ${records.length} after ${attempts} batches (${drafts.length} candidates). Existing content has been kept. ${reason}`);
  }
  return records;
}
