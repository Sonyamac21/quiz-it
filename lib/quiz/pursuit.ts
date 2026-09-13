import {
  getCorrectAnswerText,
  isAnswerCorrect,
  type ScorableQuestion,
} from "@/lib/quiz/answerScoring";

// The Pursuit — Feature Round state machine, race model, scoring, layout engine
// and answer checking. All of the round's logic lives here so the three surfaces
// (host / display / handset) stay dumb and share one source of truth.
//
// The game: every active team races through PURSUIT_TOTAL_QUESTIONS questions at
// the same time. Every team answers all seven questions; a correct answer adds
// one to its total. The highest correct total wins the round bonus.

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

// Flat per-correct-answer points - 10 for each of the first 6 correct
// answers. Getting all 7 correct is a full clear and pays a flat 100 total
// instead of 70 (per the host's explicit request: "10 points for every
// correct answer - only if 7 correct then 100 points awarded" / "6 correct -
// 60, 5 correct - 50 etc"), i.e. the last correct answer of a perfect run is
// worth 40, not 10. There is no separate end-of-round winner bonus anymore -
// a team's score is entirely determined by its own correct-answer count.
// This is the single source of truth PursuitPanel (host, awards the real
// points) and pursuitTotalPoints below (handset display) both read, so the
// two can never drift out of sync with each other again.
export const PURSUIT_CORRECT_POINTS = 10;
export const PURSUIT_PERFECT_CLEAR_POINTS = 100;

/** Total points a team holds having completed `stage` questions (0 = none). */
export function pursuitTotalPoints(stage: number): number {
  if (stage < 1) return 0;
  if (stage >= PURSUIT_TOTAL_QUESTIONS) return PURSUIT_PERFECT_CLEAR_POINTS;
  return stage * PURSUIT_CORRECT_POINTS;
}

/** Points awarded for reaching `stage` - the delta over the previous stage. */
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

/** Apply a question outcome. Teams remain active for all seven questions. */
export function applyOutcome(entry: TeamRace, correct: boolean): TeamRace {
  return { stage: entry.stage + (correct ? 1 : 0), status: "active" };
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
  { maxTeams: 60, layout: { label: "PELOTON", columns: 2, laneH: 16, runner: 12, block: 9, nameFs: 8, crest: 11, gap: 2 } },
];

/** Pick the tier for a team count. PELOTON is sized to keep up to 60 teams visible. */
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
  option_e?: string | null;
  option_f?: string | null;
}

function asScorableQuestion(q: PursuitQuestion): ScorableQuestion {
  return {
    ...q,
    option_a: q.option_a ?? null,
    option_b: q.option_b ?? null,
    option_c: q.option_c ?? null,
    option_d: q.option_d ?? null,
  };
}

/** Resolve the human-readable correct answer text for display / matching. */
export function pursuitCorrectAnswerText(q: PursuitQuestion): string {
  return getCorrectAnswerText(asScorableQuestion(q));
}

/** True when `answerText` correctly answers question `q`. */
export function checkPursuitAnswer(answerText: string | null | undefined, q: PursuitQuestion): boolean {
  if (!answerText) return false;
  return isAnswerCorrect({ answer_text: answerText }, asScorableQuestion(q));
}
