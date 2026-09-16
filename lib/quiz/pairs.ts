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
  return Array.isArray(value) ? value.filter(isPairRecord).slice(0, PAIRS_PER_ROUND) : [];
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
  let seed = [...teamName].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
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
