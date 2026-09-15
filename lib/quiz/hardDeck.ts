export const HARD_DECK_CARD_POINTS = 10;

/** The player risks the opening card value, then their accumulated pot. */
export function hardDeckGambleStake(potential: number): number {
  const safePotential = Number.isFinite(potential) ? Math.max(0, Math.floor(potential)) : 0;
  return Math.max(HARD_DECK_CARD_POINTS, safePotential);
}

/** The live stake is one shared steal pool, divided between correct predictors. */
export function hardDeckStealAward(potential: number, winnerCount: number): number {
  if (!Number.isFinite(winnerCount) || winnerCount <= 0) return 0;
  return Math.floor(hardDeckGambleStake(potential) / Math.floor(winnerCount));
}
