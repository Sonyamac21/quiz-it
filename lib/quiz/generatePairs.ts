import { PairRecord } from "@/lib/quiz/pairs";
import { audienceBrief, type QuizAudience, callAPI, ExclusionState, GENERATION_MODEL } from "@/lib/quiz/questionGenerationCore";
type DraftPair = { pair_id?: string; a?: { label?: string }; b?: { label?: string } };

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

export async function generatePairs(count: number, theme: string, exclusions: ExclusionState, audience: QuizAudience = "adults"): Promise<PairRecord[]> {
  const priorPairs = new Set([...exclusions.usedAnswers, ...exclusions.used]
    .filter(value => typeof value === "string" && value.includes(" + "))
    .map(value => value.toLowerCase().split(" + ").map(label => label.trim()).sort().join(" + ")));
  const avoid = [...priorPairs].slice(-160).join(" | ");
  const categories = ["animals and their young", "countries and capitals", "jobs and their tools", "sports and equipment", "famous characters and companions", "foods and their ingredients", "animals and their homes", "inventions and inventors", "books and authors", "musical instruments and their families"];
  const prompt = `${audienceBrief(audience)}
Create ${count} distinct WORD pairs for a Match Made quiz.${theme.trim() ? ` Theme: ${theme.trim()}.` : " Use familiar everyday associations."}
Each pair has two different short labels that naturally go together. Each tile names ONE item, never both halves such as "hammer and nail". Across the entire set, every item must have exactly one obvious partner: avoid ambiguous overlaps or interchangeable partners. Use distinct relationships, short readable words or phrases, and match the audience. Do not include images or image search queries. Avoid all previously attempted or used content: ${avoid || "none supplied"}.
Return ONLY a JSON array with items {"pair_id":"p1","a":{"label":"first item"},"b":{"label":"matching item"}}. No markdown or explanation.`;
  const records: PairRecord[] = [];
  const seen = new Set<string>();
  const failures: string[] = [];
  const attemptedLabels = new Set<string>();
  let attempts = 0;
  let duplicateSkips = 0;
  let drafts: DraftPair[] = [];
  // Retry only missing word pairs, with no media requests.
  for (let attempt = 0; attempt < 4 && records.length < count; attempt++) {
    attempts++;
    const needed = count - records.length;
    const requested = attempt === 0 ? needed : Math.min(needed + 3, 6);
    const freshAngle = theme.trim() ? "Choose different subjects within the requested theme; avoid the obvious household-object defaults."
      : `Use this relationship category for fresh ideas: ${categories[(priorPairs.size + attempt) % categories.length]}.`;
    const batch = parseArray(await callAPI(prompt.replace(`Create ${count} distinct`, `Create ${requested} distinct`) + `\n${freshAngle}\nDo not reuse these already attempted items (including rejected pairs): ${[...attemptedLabels].join(", ")}.`, 1800, false, false, GENERATION_MODEL)).slice(0, requested);
    drafts = drafts.concat(batch);
    for (let index = 0; index < batch.length && records.length < count; index++) {
    const draft = batch[index];
    if (!draft || typeof draft !== "object") continue;
    const aLabel = typeof draft.a?.label === "string" ? draft.a.label.trim() : "";
    const bLabel = typeof draft.b?.label === "string" ? draft.b.label.trim() : "";
    if (!aLabel || !bLabel || aLabel.toLowerCase() === bLabel.toLowerCase()) continue;
    const repeatedInBatch = attemptedLabels.has(aLabel.toLowerCase()) || attemptedLabels.has(bLabel.toLowerCase());
    attemptedLabels.add(aLabel.toLowerCase());
    attemptedLabels.add(bLabel.toLowerCase());
    const fingerprint = [aLabel, bLabel].map(value => value.toLowerCase()).sort().join(" + ");
    // A familiar word may belong to a genuinely different relationship in
    // another quiz. Block the pair itself across history, and duplicate labels
    // within this question; record rejected labels so retries change direction.
    if (repeatedInBatch || seen.has(fingerprint) || priorPairs.has(fingerprint)) { duplicateSkips++; continue; }
    seen.add(fingerprint);
    try {
      records.push({ pair_id: `p${records.length + 1}`, question_type: "pairs", round_type: "pairs", a: { label: aLabel }, b: { label: bLabel } });
      exclusions.used.push(`${aLabel} + ${bLabel}`);
      exclusions.usedAnswers.push(fingerprint);
    } catch (error) {
      // A genuinely unexpected failure (e.g. the AI call itself erroring)
      // still rejects just this one pair rather than the whole batch.
      failures.push(error instanceof Error ? error.message : "Pair generation failed.");
    }
    }
  }
  if (records.length !== count) {
    const reason = failures[0] || (duplicateSkips > 0 ? `${duplicateSkips} of ${drafts.length} candidates were skipped as repeats of earlier pairs - try a broader theme.` : "Try a broader theme.");
    throw new Error(`Match Made needs ${count} complete pairs. Found ${records.length} after ${attempts} batches (${drafts.length} candidates). Existing content has been kept. ${reason}`);
  }
  return records;
}
