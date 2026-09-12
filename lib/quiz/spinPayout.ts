export type SpinPayoutLabel =
  | "1st Place"
  | "2nd Place"
  | "3rd Place"
  | "Last Place"
  | "+50 Points"
  | "-10 Points"
  | "-20 Points"
  | "-30 Points";

export type SpinScore = { team_name: string; total_points: number };

/**
 * Resolve a Spin to Win outcome against one authoritative scoreboard snapshot.
 * Placement prizes use the surrounding teams' scores, while numeric prizes are
 * ordinary deltas. Negative outcomes never take a team below zero.
 */
export function calculateSpinPayout(scores: SpinScore[], teamName: string, label: SpinPayoutLabel): number | null {
  const mine = scores.find(score => score.team_name === teamName);
  if (!mine) return null;

  const myTotal = mine.total_points;
  const othersDesc = scores
    .filter(score => score.team_name !== teamName)
    .map(score => score.total_points)
    .sort((a, b) => b - a);

  if (label === "+50 Points") return myTotal + 50;
  if (label === "-10 Points") return Math.max(0, myTotal - 10);
  if (label === "-20 Points") return Math.max(0, myTotal - 20);
  if (label === "-30 Points") return Math.max(0, myTotal - 30);
  if (!othersDesc.length) return myTotal;

  if (label === "1st Place") return othersDesc[0] + 1;
  if (label === "2nd Place") {
    return othersDesc.length >= 2 ? othersDesc[1] + 1 : Math.max(0, othersDesc[0] - 1);
  }
  if (label === "3rd Place") {
    return othersDesc.length >= 3 ? othersDesc[2] + 1
      : othersDesc.length >= 2 ? Math.max(0, othersDesc[1] - 1)
      : myTotal;
  }
  return Math.max(0, othersDesc[othersDesc.length - 1] - 1);
}
