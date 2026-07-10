"use client";
import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// Authoritative score service.
//
// The `scores` table is the single source of truth for team points. Every
// score-changing action in the app (question scoring, manual host
// adjustments, Spin to Win outcomes, the Reverse Power Card, Hard Deck
// banked points, round-points reset, score-row initialisation) must go
// through the functions below rather than writing to `scores` directly.
//
// `sessions.scoreboard_data` is a denormalised read cache for surfaces that
// read scores via the `sessions` row (currently player handsets and, on
// push, the display). It is never computed independently by a component -
// every function in this module that changes `scores` also refreshes
// `scoreboard_data` from a fresh read of the `scores` table as part of the
// same call, so callers never need to remember to sync it separately.
// ============================================================================

export type ScoreRow = { team_name: string; total_points: number; round_points: number };

/**
 * Result of a score-mutating call. `applied` is false when the mutation was
 * a no-op (zero delta, or skipped by the idempotency guard) - in that case
 * scoreboard_data is left untouched, since nothing changed. `scores` is the
 * fresh scoreboard when the write succeeded. `scoreboardSyncError` is set
 * when the `scores` write itself succeeded but the scoreboard_data refresh
 * failed - the score change is NOT rolled back in that case, but callers
 * should not treat the operation as fully successful and should surface it
 * rather than assume Display/Player are up to date.
 */
export type ScoreMutationResult = {
  applied: boolean;
  scores?: ScoreRow[];
  scoreboardSyncError?: string;
};

// In-memory guard against re-applying the same score-changing event twice
// within a tab - e.g. a React effect re-firing on an unrelated state change,
// a realtime echo re-entering a handler that already ran locally, or a
// double-click on a manual adjustment button. This is not a database-level
// idempotency constraint (no schema change was made for this phase); it
// covers the duplicate-apply failure modes that exist in the current code,
// where the same host tab is the only writer for a given event.
const appliedEvents = new Set<string>();
function alreadyApplied(eventKey?: string): boolean {
  if (!eventKey) return false;
  if (appliedEvents.has(eventKey)) return true;
  appliedEvents.add(eventKey);
  return false;
}

async function readScore(supabase: SupabaseClient, sessionPin: string, teamName: string): Promise<ScoreRow> {
  const { data } = await supabase
    .from("scores")
    .select("total_points, round_points")
    .eq("session_pin", sessionPin)
    .eq("team_name", teamName)
    .maybeSingle();
  return { team_name: teamName, total_points: data?.total_points ?? 0, round_points: data?.round_points ?? 0 };
}

/** Read the authoritative scoreboard for a session, highest first. */
export async function getScores(supabase: SupabaseClient, sessionPin: string): Promise<ScoreRow[]> {
  const { data } = await supabase
    .from("scores")
    .select("team_name, total_points, round_points")
    .eq("session_pin", sessionPin)
    .order("total_points", { ascending: false });
  return data ?? [];
}

/**
 * Re-derive sessions.scoreboard_data from the authoritative `scores` table
 * and write it back (matched by pin, which every session row has - avoids
 * every call site needing a session id in scope). Internal: every exported
 * mutation below calls this itself after a successful write, so components
 * should not call it directly as a "manual sync" step.
 */
async function refreshScoreboardData(supabase: SupabaseClient, sessionPin: string): Promise<{ scores: ScoreRow[]; error?: string }> {
  const scores = await getScores(supabase, sessionPin);
  const { error } = await supabase.from("sessions").update({ scoreboard_data: scores }).eq("pin", sessionPin);
  if (error) {
    console.error("scoreService: scoreboard_data refresh failed for pin " + sessionPin + ":", error.message);
    return { scores, error: error.message };
  }
  return { scores };
}

/** Create a team's score row at 0/0 if it doesn't already exist, then refresh scoreboard_data. Safe to call repeatedly. */
export async function initTeamScore(supabase: SupabaseClient, sessionPin: string, teamName: string): Promise<ScoreMutationResult> {
  await supabase.from("scores").upsert(
    { session_pin: sessionPin, team_name: teamName, total_points: 0, round_points: 0 },
    { onConflict: "session_pin,team_name", ignoreDuplicates: true }
  );
  const { scores, error } = await refreshScoreboardData(supabase, sessionPin);
  return { applied: true, scores, scoreboardSyncError: error };
}

/**
 * Apply a point delta to a team's total (and, by default, round) points,
 * then refresh scoreboard_data. This is the path for question scoring,
 * manual host adjustments, and any other "add/subtract N points" action.
 *
 * Pass `eventKey` to make the call idempotent - if the same key is seen
 * again in this tab, the call is skipped (applied: false, no scoreboard
 * refresh - nothing changed).
 */
export async function applyScoreDelta(
  supabase: SupabaseClient,
  sessionPin: string,
  teamName: string,
  delta: number,
  opts: { roundDelta?: number; eventKey?: string } = {}
): Promise<ScoreMutationResult> {
  const roundDelta = opts.roundDelta ?? delta;
  if (delta === 0 && roundDelta === 0) return { applied: false };
  if (alreadyApplied(opts.eventKey)) return { applied: false };
  const current = await readScore(supabase, sessionPin, teamName);
  await supabase.from("scores").upsert(
    {
      session_pin: sessionPin,
      team_name: teamName,
      total_points: current.total_points + delta,
      round_points: current.round_points + roundDelta,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_pin,team_name" }
  );
  const { scores, error } = await refreshScoreboardData(supabase, sessionPin);
  return { applied: true, scores, scoreboardSyncError: error };
}

/**
 * Set a team's total points to an absolute value, then refresh
 * scoreboard_data - used where the outcome is computed as a target value
 * rather than a delta (Spin to Win rank outcomes, the Reverse Power Card).
 * round_points moves by the same amount so round totals stay consistent
 * with the flat-points scoring model.
 */
export async function setScoreAbsolute(
  supabase: SupabaseClient,
  sessionPin: string,
  teamName: string,
  newTotal: number,
  opts: { eventKey?: string } = {}
): Promise<ScoreMutationResult> {
  if (alreadyApplied(opts.eventKey)) return { applied: false };
  const current = await readScore(supabase, sessionPin, teamName);
  const delta = newTotal - current.total_points;
  if (delta === 0) return { applied: false };
  await supabase.from("scores").upsert(
    {
      session_pin: sessionPin,
      team_name: teamName,
      total_points: newTotal,
      round_points: current.round_points + delta,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_pin,team_name" }
  );
  const { scores, error } = await refreshScoreboardData(supabase, sessionPin);
  return { applied: true, scores, scoreboardSyncError: error };
}

/** Zero every team's round_points for the session (used at round start), then refresh scoreboard_data. Not a per-team delta event. */
export async function resetRoundPoints(supabase: SupabaseClient, sessionPin: string): Promise<ScoreMutationResult> {
  await supabase.from("scores").update({ round_points: 0 }).eq("session_pin", sessionPin);
  const { scores, error } = await refreshScoreboardData(supabase, sessionPin);
  return { applied: true, scores, scoreboardSyncError: error };
}
