type PixabayHit = {
  tags?: string;
  webformatURL?: string;
  largeImageURL?: string;
};

const SEARCH_FILLER = new Set([
  "a", "an", "and", "at", "background", "camera", "close", "closeup",
  "front", "image", "in", "isolated", "looking", "of", "on", "photo",
  "photograph", "picture", "shown", "showing", "side", "the", "this",
  "to", "up", "view", "with", "stock",
]);

function normalizedTerms(value: string): string[] {
  // Pixabay tags are usually ASCII even when the requested subject contains
  // accents. Normalize "crème brûlée" to "creme brulee" instead of turning
  // it into meaningless fragments such as "cr", "me", "br".
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(term => term.length > 1 && !SEARCH_FILLER.has(term))
    .map(term => term.length > 3 && term.endsWith("s") ? term.slice(0, -1) : term);
}

// AI sometimes writes a photographic direction rather than the requested
// short subject query (for example "a close-up photo of a white goat with
// horns looking at the camera"). Pixabay then matches an incidental word
// such as "camera". Search only the meaningful subject terms.
export function buildPixabaySearchQuery(rawQuery: string): string {
  const terms = normalizedTerms(rawQuery);
  return (terms.length ? terms : rawQuery.trim().split(/\s+/)).slice(0, 5).join(" ");
}

// Pixabay supplies descriptive tags for each result. Never accept the first
// hit blindly: rank all returned images by meaningful subject coverage and
// require a majority of multi-word subject terms. If none match strongly
// enough, generation rejects this candidate and retries instead of permanently
// saving an incidental/background appearance of the requested subject.
export function selectMatchingPixabayHit(hits: PixabayHit[], rawQuery: string, requiredLabel?: string): PixabayHit | null {
  const requested = new Set(normalizedTerms(rawQuery));
  if (requested.size === 0) return null;
  const labelTerms = requiredLabel ? normalizedTerms(requiredLabel) : [];
  const requiredLabelTerms = labelTerms.filter(term => term.length >= 4);
  const minimumMatches = Math.max(1, Math.ceil(requested.size * 0.6));
  // Bug: requiring at least one literal tag match for the requested LABEL
  // (not just the broader search query) was a hard filter, not a
  // preference - and Pixabay's tagging is freeform enough that a perfectly
  // good photo of a raincoat, oxygen mask, etc. often just isn't tagged
  // with that exact word (tagged "rain jacket", "waterproof coat", whatever
  // the uploader typed). For a single-word label especially, that's a
  // single point of failure that can silently zero out every candidate
  // before the vision check ever runs, with no visible sign that's what
  // happened - the caller just sees a generic "no suitable picture found".
  // The broader query-term match below (minimumMatches, already 60% of the
  // full search phrase) is the real relevance gate; label-tag matches now
  // only influence which of the relevant hits is preferred, never exclude
  // an otherwise-good one outright.
  const ranked = hits.map((hit, index) => {
    const tags = new Set(normalizedTerms(hit.tags || ""));
    const matches = [...requested].filter(term => tags.has(term)).length;
    const labelMatches = requiredLabelTerms.filter(term => tags.has(term)).length;
    return { hit, index, matches, labelMatches };
  }).filter(result => result.matches >= minimumMatches)
    .sort((a, b) => b.labelMatches - a.labelMatches || b.matches - a.matches || a.index - b.index);
  if (!ranked.length) return null;
  // Pixabay's own relevance ranking (the order `hits` already arrives in)
  // tends to surface the same handful of "editorial pick" style photos for
  // any given everyday object - moody, similarly toned stock shots. Always
  // taking the single best-scoring match therefore made every generated
  // round look visually alike even when the subjects themselves were all
  // different (reported directly: "same style of photos, not many
  // variations"). Every hit here is already an equally *valid* match - the
  // filters above already enforced that - so picking randomly among the
  // top few, instead of always the first, adds real photographic variety
  // without ever accepting a worse or less relevant picture.
  const pool = ranked.slice(0, Math.min(5, ranked.length));
  return pool[Math.floor(Math.random() * pool.length)].hit;
}
