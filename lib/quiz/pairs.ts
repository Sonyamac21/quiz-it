export const PAIRS_PER_ROUND = 3;

export type PairItem = {
  label: string;
  image_url: string;
};

export type PairRecord = {
  pair_id: string;
  a: PairItem;
  b: PairItem;
  question_type?: "pairs";
  round_type?: "pairs";
};

export type PairsQuestion = { question_type: "pairs"; round_type: "pairs"; pairs: PairRecord[] };

export async function generatePairsQuestions(count: number, generate: (index: number) => Promise<PairRecord[]>, accept?: (question: PairsQuestion) => void) {
  const questions: PairsQuestion[] = [];
  for (let index = 0; index < Math.max(0, Math.floor(count)); index++) {
    try {
      const question: PairsQuestion = { question_type: "pairs", round_type: "pairs", pairs: await generate(index) };
      if (!isPairsQuestion(question)) throw new Error("The question did not contain three complete, distinct pairs.");
      questions.push(question);
      accept?.(question);
    } catch (error) {
      return { questions, error: error instanceof Error ? error.message : "Image generation failed." };
    }
  }
  return { questions, error: null };
}

export function readPairsQuestions(value: unknown): PairsQuestion[] {
  if (!Array.isArray(value)) return [];
  const bundled = value.filter(isPairsQuestion);
  if (bundled.length) return bundled;
  return value.length === 3 && value.every(isPairRecord)
    ? [{ question_type: "pairs", round_type: "pairs", pairs: value }] : [];
}

export function pairsForQuestion(questions: unknown, index: number): PairRecord[] {
  return (readPairsQuestions(questions)[index]?.pairs || []).map((pair, i) => ({ ...pair, pair_id: `q${index}-p${i}` }));
}

export function isPairsQuestion(value: unknown): value is PairsQuestion {
  const q = value as PairsQuestion | null;
  return Boolean(q && Array.isArray(q.pairs) && q.pairs.length === PAIRS_PER_ROUND && q.pairs.every(isPairRecord) && new Set(q.pairs.map(p => p.pair_id)).size === PAIRS_PER_ROUND);
}

export type PairTeamProgress = {
  solved_pair_ids: string[];
  mistakes: number;
  selected_tile_id?: string | null;
};

export type PairsProgress = Record<string, PairTeamProgress>;

export type PairTile = PairItem & {
  id: string;
  pair_id: string;
};

export function isPairRecord(value: unknown): value is PairRecord {
  const pair = value as PairRecord | null;
  return Boolean(
    pair && typeof pair.pair_id === "string" && pair.pair_id.trim() &&
    typeof pair.a?.label === "string" && pair.a.label.trim() &&
    typeof pair.a?.image_url === "string" && pair.a.image_url.trim() &&
    typeof pair.b?.label === "string" && pair.b.label.trim() &&
    typeof pair.b?.image_url === "string" && pair.b.image_url.trim(),
  );
}

export function readPairs(value: unknown): PairRecord[] {
  if (!Array.isArray(value)) return [];
  const out: PairRecord[] = [];
  for (const item of value) {
    const row = item as PairsQuestion;
    if (Array.isArray(row?.pairs)) out.push(...row.pairs.filter(isPairRecord));
    else if (isPairRecord(item)) out.push(item);
  }
  return out.slice(0, PAIRS_PER_ROUND);
}

export function readPairsProgress(value: unknown): PairsProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: PairsProgress = {};
  for (const [team, raw] of Object.entries(value as Record<string, unknown>)) {
    const row = raw as Partial<PairTeamProgress> | null;
    result[team] = {
      solved_pair_ids: Array.isArray(row?.solved_pair_ids) ? row.solved_pair_ids.filter((id): id is string => typeof id === "string") : [],
      mistakes: Number.isFinite(row?.mistakes) ? Math.max(0, Number(row?.mistakes)) : 0,
      selected_tile_id: typeof row?.selected_tile_id === "string" ? row.selected_tile_id : null,
    };
  }
  return result;
}

export function tilesForTeam(pairs: PairRecord[], teamName: string): PairTile[] {
  const tiles = pairs.flatMap(pair => ([
    { ...pair.a, id: `${pair.pair_id}-a`, pair_id: pair.pair_id },
    { ...pair.b, id: `${pair.pair_id}-b`, pair_id: pair.pair_id },
  ]));
  // Stable per-team shuffle: reconnecting never moves a team's tiles, while
  // neighbouring teams do not all receive the same board order.
  const identity = JSON.stringify([teamName.trim().toLowerCase(), pairs.map(p => [p.pair_id, p.a.label, p.a.image_url, p.b.label, p.b.image_url])]);
  let seed = [...identity].reduce((total, char) => Math.imul(total ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);
  // Six tiles have only 720 permutations. Choose among the layouts that
  // do not put a match opposite itself in the handset's two-column grid.
  // Enumerating them avoids unbounded shuffle retries or a fixed fallback.
  if (tiles.length === 6) {
    const layouts: PairTile[][] = [];
    const visit = (placed: PairTile[], remaining: PairTile[]) => {
      if (!remaining.length) { layouts.push(placed); return; }
      remaining.forEach((tile, index) => {
        if (placed.length % 2 === 1 && placed[placed.length - 1].pair_id === tile.pair_id) return;
        visit([...placed, tile], remaining.filter((_, i) => i !== index));
      });
    };
    visit([], tiles);
    if (layouts.length) return layouts[seed % layouts.length];
  }
  const result = [...tiles];
  for (let i = result.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function pairProgressForTeam(progress: PairsProgress, teamName: string): PairTeamProgress {
  const exact = progress[teamName];
  if (exact) return exact;
  const key = Object.keys(progress).find(name => name.trim().toLowerCase() === teamName.trim().toLowerCase());
  return key ? progress[key] : { solved_pair_ids: [], mistakes: 0, selected_tile_id: null };
}
