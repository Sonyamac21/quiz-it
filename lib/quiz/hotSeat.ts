export const HOT_SEAT_ANSWER_SECONDS = 15;

export type HotSeatStatus = "idle" | "open" | "claimed" | "submitted";

export type HotSeatState = {
  status: HotSeatStatus;
  team: string | null;
  lockedTeams: string[];
  answerStartedAt: string | null;
  answerDuration: number;
};

export function readHotSeatState(data: Record<string, unknown>): HotSeatState {
  const rawStatus = data.hot_seat_status;
  const status: HotSeatStatus = rawStatus === "open" || rawStatus === "claimed" || rawStatus === "submitted"
    ? rawStatus
    : "idle";
  const rawLocked = Array.isArray(data.hot_seat_locked_teams) ? data.hot_seat_locked_teams : [];

  return {
    status,
    team: typeof data.hot_seat_team === "string" && data.hot_seat_team ? data.hot_seat_team : null,
    lockedTeams: rawLocked.filter((team): team is string => typeof team === "string"),
    answerStartedAt: typeof data.hot_seat_answer_started_at === "string" ? data.hot_seat_answer_started_at : null,
    answerDuration: typeof data.hot_seat_answer_duration === "number"
      ? data.hot_seat_answer_duration
      : HOT_SEAT_ANSWER_SECONDS,
  };
}
