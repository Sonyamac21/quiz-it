export type FinalBonusMode = "winner_only" | "sliding_all";

/** Rank is zero-based among correct submissions. Non-final rounds retain the
 * established capped sliding scale. Final rounds use the host's explicit mode. */
export function speedBonusForRank(rank: number, maximum: number, isFinalRound: boolean, finalMode: FinalBonusMode): number {
  const max = Math.max(0, Math.floor(maximum));
  if (rank < 0 || max === 0) return 0;
  if (!isFinalRound) return Math.max(0, max - rank);
  if (finalMode === "winner_only") return rank === 0 ? max : 0;
  return Math.max(1, max - rank);
}
