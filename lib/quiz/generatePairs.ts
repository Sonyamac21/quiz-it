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
  const avoid = [...exclusions.used.slice(-120), ...exclusions.usedAnswers.slice(-120)].join(" | ").slice(0, 7000);
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
    const batch = parseArray(await callAPI(prompt.replace(`Create ${count} distinct`, `Create ${Math.min(needed, 6)} distinct`) + `\nDo not reuse these already attempted items (including rejected pairs): ${[...attemptedLabels].join(", ")}.`, 1800, false, false, GENERATION_MODEL)).slice(0, needed);
    drafts = drafts.concat(batch);
    for (let index = 0; index < batch.length && records.length < count; index++) {
    const draft = batch[index];
    if (!draft || typeof draft !== "object") continue;
    const aLabel = typeof draft.a?.label === "string" ? draft.a.label.trim() : "";
    const bLabel = typeof draft.b?.label === "string" ? draft.b.label.trim() : "";
    if (!aLabel || !bLabel || aLabel.toLowerCase() === bLabel.toLowerCase()) continue;
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
    if (seen.has(fingerprint) || (exclusions.usedAnswers.includes(fingerprint) || exclusions.used.some(value => String(value || "").toLowerCase() === fingerprint))) { duplicateSkips++; continue; }
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
