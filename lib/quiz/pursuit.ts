// The Pursuit — Feature Round state machine, race model, scoring, layout engine
// and answer checking. All of the round's logic lives here so the three surfaces
// (host / display / handset) stay dumb and share one source of truth.
//
// The game: every active team races through PURSUIT_TOTAL_QUESTIONS questions at
// the same time. A correct answer advances a team one stage; a single wrong
// answer eliminates it (it stays visible, frozen). Multiple teams can finish.

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export type PursuitPhase =
  | "idle" // not started (panel closed)
  | "waiting" // opened; teams gathering
  | "intro" // round intro on the display
  | "question" // a question is live; handsets answer
  | "reveal" // correct answer shown; runners not yet moved
  | "advance" // runners updated simultaneously from the reveal
  | "complete" // round finished
  | "results"; // final standings

/** The linear phase graph. `advance` loops back to `question` for the next round;
 * the host jumps to `complete` via Finish Round. `results` is terminal. */
const PURSUIT_TRANSITIONS: Record<PursuitPhase, PursuitPhase | null> = {
  idle: "intro",
  waiting: "intro",
  intro: "question",
  question: "reveal",
  reveal: "advance",
  advance: "question",
  complete: "results",
  results: null,
};

export function getNextPursuitPhase(current: PursuitPhase): PursuitPhase | null {
  return PURSUIT_TRANSITIONS[current] ?? null;
}

export function getPursuitPhaseLabel(phase: PursuitPhase): string {
  switch (phase) {
    case "idle":
      return "IDLE";
    case "waiting":
      return "WAITING";
    case "intro":
      return "INTRO";
    case "question":
      return "QUESTION";
    case "reveal":
      return "REVEAL";
    case "advance":
      return "ADVANCE";
    case "complete":
      return "COMPLETE";
    case "results":
      return "RESULTS";
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export const PURSUIT_TOTAL_QUESTIONS = 7;

/** Cumulative total points a team holds after clearing each stage (1-indexed).
 * Stage 7 is 100, not 70 — the final stage carries a completion bonus. */
export const PURSUIT_POINTS_LADDER = [10, 20, 30, 40, 50, 60, 100];

/** Total points a team holds having completed `stage` questions (0 = none). */
export function pursuitTotalPoints(stage: number): number {
  if (stage < 1) return 0;
  const capped = Math.min(stage, PURSUIT_TOTAL_QUESTIONS);
  return PURSUIT_POINTS_LADDER[capped - 1];
}

/** Points awarded for reaching `stage` — the delta over the previous stage. */
export function pursuitStagePoints(stage: number): number {
  return pursuitTotalPoints(stage) - pursuitTotalPoints(stage - 1);
}

// ---------------------------------------------------------------------------
// Race model
// ---------------------------------------------------------------------------

export type TeamRaceStatus = "active" | "eliminated" | "completed";

/** One team's position in the race. `stage` = number of consecutive corrects. */
export interface TeamRace {
  stage: number;
  status: TeamRaceStatus;
}

/** Team name -> race position. */
export type PursuitRace = Record<string, TeamRace>;

/** Every team on the start line: stage 0, active. */
export function initRace(teamNames: string[]): PursuitRace {
  const race: PursuitRace = {};
  for (const name of teamNames) race[name] = { stage: 0, status: "active" };
  return race;
}

/** Apply a question outcome to one team (only active teams move). */
export function applyOutcome(entry: TeamRace, correct: boolean): TeamRace {
  if (entry.status !== "active") return entry;
  if (!correct) return { stage: entry.stage, status: "eliminated" };
  const stage = entry.stage + 1;
  return { stage, status: stage >= PURSUIT_TOTAL_QUESTIONS ? "completed" : "active" };
}

export interface RaceSummary {
  active: string[];
  eliminated: string[];
  completed: string[];
}

/** Split the roster into active / eliminated / completed, preserving order. */
export function summariseRace(race: PursuitRace, teamNames: string[]): RaceSummary {
  const summary: RaceSummary = { active: [], eliminated: [], completed: [] };
  for (const name of teamNames) {
    const status = race[name]?.status ?? "active";
    summary[status].push(name);
  }
  return summary;
}

/** True while at least one team can still advance. */
export function hasActiveTeams(race: PursuitRace, teamNames: string[]): boolean {
  return teamNames.some((name) => (race[name]?.status ?? "active") === "active");
}

// ---------------------------------------------------------------------------
// Session-row mapping. The Pursuit reuses two existing columns: `pursuit_status`
// (the phase) and `pursuit_data` (the race JSON). No other pursuit_* columns are
// used, and no new columns / migrations are required.
// ---------------------------------------------------------------------------

const RACE_KEY = "race";
const QINDEX_KEY = "qIndex";
const STARTED_KEY = "startedAt";

export interface PursuitState {
  status: PursuitPhase;
  data: Record<string, unknown>;
}

export function readPursuitState(row: Record<string, unknown>): PursuitState {
  return {
    status: (row.pursuit_status as PursuitPhase) || "idle",
    data: (row.pursuit_data as Record<string, unknown>) || {},
  };
}

export function readRace(state: PursuitState): PursuitRace {
  return (state.data[RACE_KEY] as PursuitRace) || {};
}

/** Zero-based index of the current question (0 .. PURSUIT_TOTAL_QUESTIONS-1). */
export function readQIndex(state: PursuitState): number {
  return (state.data[QINDEX_KEY] as number) ?? 0;
}

/** ISO timestamp the round started — scopes answer reads to this round only. */
export function readStartedAt(state: PursuitState): string | null {
  return (state.data[STARTED_KEY] as string) || null;
}

/** Build the pursuit_data payload from the three pieces of race state. */
export function buildPursuitData(race: PursuitRace, qIndex: number, startedAt: string | null): Record<string, unknown> {
  return { [RACE_KEY]: race, [QINDEX_KEY]: qIndex, [STARTED_KEY]: startedAt };
}

/** Host-scoped realtime channel prefix (mirrors The Hard Deck's convention). */
export const PURSUIT_CHANNEL_PREFIX = "pursuit-host-";

// ---------------------------------------------------------------------------
// Responsive display layout engine — the four tiers from the approved prototype.
//
// The tier is chosen once, from the active team count, and never changes
// mid-round. Sizes here are prototype-scale (~1300px board); the renderer scales
// every token proportionally to the real board width (the ratios are the design,
// not the pixels). GRAND/FIELD use one column; DIVISION/PELOTON use two columns
// that mirror inward toward a shared central finish column.
// ---------------------------------------------------------------------------

export type PursuitTierLabel = "GRAND" | "FIELD" | "DIVISION" | "PELOTON";

export interface PursuitLayout {
  label: PursuitTierLabel;
  columns: 1 | 2;
  laneH: number; // lane height (px, prototype scale)
  runner: number; // runner marker size
  block: number; // stage block size
  nameFs: number; // team-name font size
  crest: number; // team badge size
  gap: number; // vertical gap between lanes
}

/** The board width the tier px values are authored against. Renderer scales from here. */
export const PURSUIT_PROTOTYPE_WIDTH = 1300;

const PURSUIT_TIERS: { maxTeams: number; layout: PursuitLayout }[] = [
  { maxTeams: 6, layout: { label: "GRAND", columns: 1, laneH: 96, runner: 52, block: 38, nameFs: 21, crest: 38, gap: 24 } },
  { maxTeams: 12, layout: { label: "FIELD", columns: 1, laneH: 72, runner: 44, block: 34, nameFs: 17, crest: 30, gap: 18 } },
  { maxTeams: 24, layout: { label: "DIVISION", columns: 2, laneH: 52, runner: 34, block: 24, nameFs: 14, crest: 24, gap: 12 } },
  { maxTeams: 40, layout: { label: "PELOTON", columns: 2, laneH: 36, runner: 24, block: 18, nameFs: 12, crest: 18, gap: 8 } },
];

/** Pick the tier for a team count. Above 40 falls back to PELOTON. */
export function computePursuitLayout(teamCount: number): PursuitLayout {
  const n = Math.max(1, teamCount);
  const tier = PURSUIT_TIERS.find((t) => n <= t.maxTeams) ?? PURSUIT_TIERS[PURSUIT_TIERS.length - 1];
  return tier.layout;
}

/** Scale every tier token proportionally to the real board width. */
export function scalePursuitLayout(layout: PursuitLayout, boardWidth: number): PursuitLayout {
  const k = boardWidth > 0 ? boardWidth / PURSUIT_PROTOTYPE_WIDTH : 1;
  return {
    ...layout,
    laneH: layout.laneH * k,
    runner: layout.runner * k,
    block: layout.block * k,
    nameFs: layout.nameFs * k,
    crest: layout.crest * k,
    gap: layout.gap * k,
  };
}

// ---------------------------------------------------------------------------
// Answer checking
//
// Self-contained correctness check — the Pursuit's single source of truth for
// "did this team get the question right". Handles the standard question types.
// ---------------------------------------------------------------------------

export interface PursuitQuestion {
  question_type: string;
  correct_answer: string;
  option_a?: string | null;
  option_b?: string | null;
  option_c?: string | null;
  option_d?: string | null;
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/^(the|a|an) /i, "").trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

/** Resolve the human-readable correct answer text for display / matching. */
export function pursuitCorrectAnswerText(q: PursuitQuestion): string {
  const map: Record<string, string | null | undefined> = {
    a: q.option_a,
    b: q.option_b,
    c: q.option_c,
    d: q.option_d,
  };
  if (q.question_type === "multiple_choice") {
    return map[q.correct_answer.toLowerCase()] || q.correct_answer;
  }
  if (q.question_type === "sequence") {
    const order = q.correct_answer.split(",").map((s) => s.trim().toLowerCase());
    const texts = order.map((key) => map[key]).filter((t): t is string => !!t);
    return texts.length === order.length ? texts.join(", ") : q.correct_answer;
  }
  return q.correct_answer;
}

function fuzzyMatch(answer: string, correct: string, q: PursuitQuestion): boolean {
  if (q.question_type === "multiple_choice" && answer.trim().toLowerCase() === q.correct_answer.toLowerCase()) return true;
  if (q.question_type === "number") return answer.trim() === correct.trim();
  const a = normalise(answer);
  const b = normalise(correct);
  if (a === b) return true;
  if (a === "" || b === "") return false;
  if (b.includes(a) && a.length >= 4 && a.length >= b.length * 0.6) return true;
  if (a.includes(b) && b.length >= 4 && b.length >= a.length * 0.6) return true;
  const maxDist = Math.max(1, Math.floor(b.length * 0.3));
  return levenshtein(a, b) <= maxDist;
}

/** True when `answerText` correctly answers question `q`. */
export function checkPursuitAnswer(answerText: string | null | undefined, q: PursuitQuestion): boolean {
  if (!answerText) return false;
  if (q.question_type === "multi_tap") {
    const correctKeys = (q.correct_answer || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const tapped = answerText.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const hits = tapped.filter((k) => correctKeys.includes(k));
    return correctKeys.length > 0 && hits.length === correctKeys.length && tapped.length === correctKeys.length;
  }
  if (q.question_type === "sequence") {
    return answerText.trim().toLowerCase().replace(/\s/g, "") === q.correct_answer.trim().toLowerCase().replace(/\s/g, "");
  }
  return fuzzyMatch(answerText, pursuitCorrectAnswerText(q), q);
}
