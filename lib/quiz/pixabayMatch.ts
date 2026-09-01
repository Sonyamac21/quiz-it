type PixabayHit = {
  tags?: string;
  webformatURL?: string;
  largeImageURL?: string;
};

const SEARCH_FILLER = new Set([
  "a", "an", "and", "at", "background", "camera", "close", "closeup",
  "front", "image", "in", "isolated", "looking", "of", "on", "photo",
  "photograph", "picture", "shown", "showing", "side", "the", "this",
  "to", "up", "view", "with",
]);

function normalizedTerms(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
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
// hit blindly: require at least one meaningful requested subject term to be
// present in its tags. If none match, generation rejects this candidate and
// retries instead of permanently saving an unrelated picture.
export function selectMatchingPixabayHit(hits: PixabayHit[], rawQuery: string): PixabayHit | null {
  const requested = new Set(normalizedTerms(rawQuery));
  if (requested.size === 0) return null;
  return hits.find(hit => normalizedTerms(hit.tags || "").some(tag => requested.has(tag))) || null;
}
