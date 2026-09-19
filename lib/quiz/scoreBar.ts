// Relative standings scale, including rooms where every total is negative.
export function scoreBarPercent(score: number, highest: number, lowest: number): number {
  const floor = Math.min(0, lowest);
  const span = highest - floor;
  if (span === 0) return 100;
  return Math.max(4, Math.min(100, Math.round(4 + 96 * (score - floor) / span)));
}
