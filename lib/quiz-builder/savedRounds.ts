import type { QuizRound } from "./types";

/** A detached copy: automatic quiz sync must never overwrite the holding area. */
export function savedRoundPayload(round: QuizRound, quizName: string) {
  return {
    name: `${round.name} — ${quizName}`,
    folder: "Saved for later", synced_from_quiz_round_id: null,
    round_type: round.round_type, difficulty: round.difficulty,
    theme: round.theme, questions: structuredClone(round.questions),
    hide_leaderboard: round.hide_leaderboard, allow_power_cards: round.allow_power_cards,
    points_per_question: round.points_per_question,
    danger_zone_enabled: round.danger_zone_enabled,
    danger_zone_penalty: round.danger_zone_penalty, max_time_bonus: round.max_time_bonus,
  };
}

/** Retry the same save without accumulating duplicate library rounds. */
export async function savedRoundId(sourceId: string, payload: ReturnType<typeof savedRoundPayload>) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([sourceId, payload]))));
  hash[6] = (hash[6] & 15) | 80;
  hash[8] = (hash[8] & 63) | 128;
  const hex = Array.from(hash.slice(0, 16), byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
