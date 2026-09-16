import { PairRecord } from "@/lib/quiz/pairs";
import { buildPixabaySearchQuery, selectMatchingPixabayHit } from "@/lib/quiz/pixabayMatch";
import { persistPixabayImage } from "@/lib/quiz/persistPixabayImage";
import { callAPI, ExclusionState, GENERATION_MODEL } from "@/lib/quiz/questionGenerationCore";

type DraftPair = { pair_id?: string; a?: { label?: string; image_query?: string }; b?: { label?: string; image_query?: string } };

function parseArray(text: string): DraftPair[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("Pairs generator returned invalid JSON");
  return JSON.parse(text.slice(start, end + 1)) as DraftPair[];
}

async function sourceImage(query: string, label: string): Promise<string> {
  const key = process.env.NEXT_PUBLIC_PIXABAY_API_KEY;
  if (!key) throw new Error("Pixabay is not configured");
  const search = buildPixabaySearchQuery(query);
  const response = await fetch(`https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(search)}&image_type=photo&per_page=8&safesearch=true`);
  if (!response.ok) throw new Error("Picture search failed");
  const data = await response.json();
  const hit = selectMatchingPixabayHit(data?.hits || [], query);
  const source = hit?.webformatURL || hit?.largeImageURL;
  if (!source) throw new Error(`No suitable picture found for ${query}`);
  // Pixabay's CDN URLs are routinely blocked by the model vision endpoint's
  // robots.txt policy. Match Made already uses the shared relevance-ranked
  // Pixabay hit selector, so do not run the URL-based vision validator here;
  // it would reject every otherwise valid pair before it can be persisted.
  return (await persistPixabayImage(source)).url;
}

export async function generatePairs(count: number, theme: string, exclusions: ExclusionState): Promise<PairRecord[]> {
  const avoid = exclusions.used.slice(-120).join(" | ").slice(0, 5000);
  const prompt = `Create ${count} distinct odd-couple picture pairs for a commercial pub quiz Pairs round.${theme.trim() ? ` Theme: ${theme.trim()}.` : " Use broad, internationally accessible general knowledge."}
Each pair contains two DIFFERENT concrete things that naturally go together conceptually (examples of the relationship only: lock + key, needle + thread). Do not copy those examples. Do not create visually identical objects, two people, brands, logos, flags, copyrighted characters, wordplay, region-specific slang, abstract ideas, or a pair whose relationship is debatable. Each item must be easy to represent with an ordinary stock photograph and instantly distinguishable on a phone. Use a different relationship and subject area for every pair. Avoid overused facts or content already seen here: ${avoid || "none supplied"}.
Return ONLY a JSON array. Every item must be exactly {"pair_id":"p1","a":{"label":"short visible label","image_query":"precise English stock-photo search"},"b":{"label":"short visible label","image_query":"precise English stock-photo search"}}. No markdown or explanation.`;
  const records: PairRecord[] = [];
  const seen = new Set<string>();
  const failures: string[] = [];
  let drafts: DraftPair[] = [];
  for (let attempt = 0; attempt < 4 && records.length < count; attempt++) {
    const needed = count - records.length;
    const batch = parseArray(await callAPI(prompt.replace(`Create ${count} distinct`, `Create ${Math.min(needed + 2, 6)} distinct`), 1800, false, false, GENERATION_MODEL)).slice(0, needed + 2);
    drafts = drafts.concat(batch);
    for (let index = 0; index < batch.length && records.length < count; index++) {
    const draft = batch[index];
    const aLabel = draft.a?.label?.trim(), bLabel = draft.b?.label?.trim();
    const aQuery = draft.a?.image_query?.trim(), bQuery = draft.b?.image_query?.trim();
    if (!aLabel || !bLabel || !aQuery || !bQuery || aLabel.toLowerCase() === bLabel.toLowerCase()) continue;
    const fingerprint = [aLabel, bLabel].map(value => value.toLowerCase()).sort().join(" + ");
    if (seen.has(fingerprint) || exclusions.used.some(value => String(value || "").toLowerCase().includes(fingerprint))) continue;
    seen.add(fingerprint);
    try {
      // Deliberately reuse the exact Pixabay matching + permanent re-hosting
      // helpers used by picture questions; Pairs has no second media path.
      const [aImage, bImage] = await Promise.all([sourceImage(aQuery, aLabel), sourceImage(bQuery, bLabel)]);
      records.push({ pair_id: `p${records.length + 1}`, question_type: "pairs", round_type: "pairs", a: { label: aLabel, image_url: aImage }, b: { label: bLabel, image_url: bImage } });
      exclusions.used.push(`${aLabel} + ${bLabel}`);
    } catch (error) {
      // A missing or misleading stock image rejects the whole pair rather
      // than saving a half-built round the host cannot play.
      failures.push(error instanceof Error ? error.message : "image validation failed");
    }
    }
  }
  if (records.length === 0 && drafts.length > 0) {
    throw new Error(`Match Made generation found no usable pairs. ${failures[0] || "The returned pair data was invalid."}`);
  }
  return records;
}
