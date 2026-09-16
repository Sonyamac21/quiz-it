import { PairRecord } from "@/lib/quiz/pairs";
import { buildPixabaySearchQuery, selectMatchingPixabayHit } from "@/lib/quiz/pixabayMatch";
import { persistPixabayImage } from "@/lib/quiz/persistPixabayImage";
import { callAPI, checkPictureIdentity, ExclusionState, GENERATION_MODEL, Question } from "@/lib/quiz/questionGenerationCore";

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
  const visualQuestion: Question = { question_text: `This image must clearly show ${label}.`, question_type: "picture", option_a: query, option_b: source, option_c: null, option_d: null, option_e: null, option_f: null, correct_answer: label, explanation: "Pairs image identity check", difficulty: "easy", round_type: "pairs" };
  const visual = await checkPictureIdentity(visualQuestion, source);
  if (!visual.ok) throw new Error(visual.note || `Picture did not clearly show ${label}`);
  return (await persistPixabayImage(source)).url;
}

export async function generatePairs(count: number, theme: string, exclusions: ExclusionState): Promise<PairRecord[]> {
  const avoid = exclusions.used.slice(-120).join(" | ").slice(0, 5000);
  const prompt = `Create ${count} distinct odd-couple picture pairs for a commercial pub quiz Pairs round.${theme.trim() ? ` Theme: ${theme.trim()}.` : " Use broad, internationally accessible general knowledge."}
Each pair contains two DIFFERENT concrete things that naturally go together conceptually (examples of the relationship only: lock + key, needle + thread). Do not copy those examples. Do not create visually identical objects, two people, brands, logos, flags, copyrighted characters, wordplay, region-specific slang, abstract ideas, or a pair whose relationship is debatable. Each item must be easy to represent with an ordinary stock photograph and instantly distinguishable on a phone. Use a different relationship and subject area for every pair. Avoid overused facts or content already seen here: ${avoid || "none supplied"}.
Return ONLY a JSON array. Every item must be exactly {"pair_id":"p1","a":{"label":"short visible label","image_query":"precise English stock-photo search"},"b":{"label":"short visible label","image_query":"precise English stock-photo search"}}. No markdown or explanation.`;
  const drafts = parseArray(await callAPI(prompt, 1800, false, false, GENERATION_MODEL)).slice(0, count);
  const records: PairRecord[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < drafts.length; index++) {
    const draft = drafts[index];
    const aLabel = draft.a?.label?.trim(), bLabel = draft.b?.label?.trim();
    const aQuery = draft.a?.image_query?.trim(), bQuery = draft.b?.image_query?.trim();
    if (!aLabel || !bLabel || !aQuery || !bQuery || aLabel.toLowerCase() === bLabel.toLowerCase()) continue;
    const fingerprint = [aLabel, bLabel].map(value => value.toLowerCase()).sort().join(" + ");
    if (seen.has(fingerprint) || exclusions.used.some(value => value.toLowerCase().includes(fingerprint))) continue;
    seen.add(fingerprint);
    try {
      // Deliberately reuse the exact Pixabay matching + permanent re-hosting
      // helpers used by picture questions; Pairs has no second media path.
      const [aImage, bImage] = await Promise.all([sourceImage(aQuery, aLabel), sourceImage(bQuery, bLabel)]);
      records.push({ pair_id: `p${records.length + 1}`, question_type: "pairs", round_type: "pairs", a: { label: aLabel, image_url: aImage }, b: { label: bLabel, image_url: bImage } });
      exclusions.used.push(`${aLabel} + ${bLabel}`);
    } catch {
      // A missing or misleading stock image rejects the whole pair rather
      // than saving a half-built round the host cannot play.
    }
  }
  return records;
}
