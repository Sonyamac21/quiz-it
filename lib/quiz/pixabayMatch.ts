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
export function selectMatchingPixabayHit(hits: PixabayHit[], rawQuery: string): PixabayHit | null {
  const requested = new Set(normalizedTerms(rawQuery));
  if (requested.size === 0) return null;
  const minimumMatches = Math.max(1, Math.ceil(requested.size * 0.6));
  const ranked = hits.map((hit, index) => {
    const tags = new Set(normalizedTerms(hit.tags || ""));
    const matches = [...requested].filter(term => tags.has(term)).length;
    return { hit, index, matches };
  }).filter(result => result.matches >= minimumMatches)
    .sort((a, b) => b.matches - a.matches || a.index - b.index);
  return ranked[0]?.hit || null;
}
