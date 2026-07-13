"use client";
import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { applyScoreDelta } from "@/lib/quiz/scoreService";
import {
  PursuitPhase,
  PursuitRace,
  PURSUIT_CHANNEL_PREFIX,
  PURSUIT_TOTAL_QUESTIONS,
  getPursuitPhaseLabel,
  readPursuitState,
  readRace,
  readQIndex,
  readStartedAt,
  buildPursuitData,
  initRace,
  applyOutcome,
  summariseRace,
  hasActiveTeams,
  checkPursuitAnswer,
  pursuitStagePoints,
  pursuitTotalPoints,
} from "@/lib/quiz/pursuit";

// THE PURSUIT — host controller.
//
// Mirrors HardDeckPanel: a launch button in the host header opens a full-viewport
// portal overlay that drives the round's state machine, writing the authoritative
// pursuit_status + pursuit_data and echoing over its own realtime channel. The
// question micro-flow reuses the existing current_question / answers plumbing:
// "Next Question" pushes one of the round's questions to every handset, and
// "Advance Race" reads their answers back to move / eliminate the runners. All
// race + scoring logic lives in lib/quiz/pursuit.ts.

type RoundQuestion = {
  question_text: string;
  question_type: string;
  correct_answer: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
};

type AnswerRow = { team_name: string; answer_text: string; submitted_at: string };

type PursuitRoundOption = { id: string; name: string; questions: RoundQuestion[] };

type Props = {
  sessionId: string;
  sessionPin: string;
  teams: { team_name: string }[];
  rounds: PursuitRoundOption[];
  onScoreChange?: () => void;
};

export function PursuitPanel({ sessionId, sessionPin, teams, rounds, onScoreChange }: Props) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PursuitPhase>("idle");
  const [race, setRace] = useState<PursuitRace>({});
  const [qIndex, setQIndex] = useState(-1);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [roundId, setRoundId] = useState("");

  const teamNames = teams.map((t) => t.team_name);
  // The Pursuit runs a dedicated saved Pursuit round (round_type "pursuit"),
  // chosen here — it no longer reuses whatever standard round is selected.
  const chosenRound = rounds.find((r) => r.id === roundId) ?? rounds[0] ?? null;
  const pursuitQuestions = (chosenRound?.questions ?? []).slice(0, PURSUIT_TOTAL_QUESTIONS);

  const hydrate = useCallback((row: Record<string, unknown>) => {
    const p = readPursuitState(row);
    setStatus(p.status);
    setRace(readRace(p));
    setQIndex(readQIndex(p));
    setStartedAt(readStartedAt(p));
  }, []);

  // Refresh recovery: reopen and restore from the row if a Pursuit is in progress.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("sessions").select("*").eq("id", sessionId).single();
      if (cancelled || !data) return;
      const p = readPursuitState(data as Record<string, unknown>);
      // Only auto-reopen for a genuinely in-progress Pursuit — never for a stale
      // or unrecognised pursuit_status (e.g. left over from earlier testing),
      // which must not pop the overlay or hide the inline launch button.
      const ACTIVE: PursuitPhase[] = ["intro", "question", "reveal", "advance", "complete", "results"];
      if (ACTIVE.includes(p.status)) {
        setOpen(true);
        hydrate(data as Record<string, unknown>);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, supabase, hydrate]);

  // Realtime echo channel (mirrors The Hard Deck). No polling.
  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(PURSUIT_CHANNEL_PREFIX + sessionPin)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: "id=eq." + sessionId },
        (payload) => hydrate(payload.new as Record<string, unknown>)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, sessionPin, supabase, hydrate]);

  const pushState = useCallback(async (fields: Record<string, unknown>) => {
    const { error } = await supabase.from("sessions").update(fields).eq("id", sessionId);
    // Surface a failed write (e.g. the pursuit_status / pursuit_data columns not
    // yet migrated) instead of silently no-opping, so a launch that doesn't move
    // the Display is diagnosable during live testing.
    if (error) console.error("PURSUIT SESSION UPDATE FAILED:", error.message);
  }, [sessionId, supabase]);

  function startPursuit() {
    const initial = initRace(teamNames);
    const now = new Date().toISOString();
    setOpen(true);
    setStatus("intro");
    setRace(initial);
    setQIndex(-1);
    setStartedAt(now);
    pushState({
      phase: "pursuit",
      pursuit_status: "intro",
      pursuit_data: buildPursuitData(initial, -1, now),
      current_question: null,
      current_question_index: 0,
    });
  }

  async function nextQuestion() {
    const newIndex = qIndex + 1;
    if (newIndex >= pursuitQuestions.length) return;
    const q = pursuitQuestions[newIndex];
    setQIndex(newIndex);
    setStatus("question");
    await pushState({
      pursuit_status: "question",
      current_question: q,
      current_question_index: newIndex,
      pursuit_data: buildPursuitData(race, newIndex, startedAt),
    });
  }

  async function revealAnswer() {
    setStatus("reveal");
    await pushState({ pursuit_status: "reveal" });
  }

  // Read every team's latest answer to the current question and move the race:
  // active teams that answered correctly advance (and score the stage delta);
  // everyone else is eliminated. Runs off the answers table, scoped to this round.
  async function advanceRace() {
    const q = pursuitQuestions[qIndex];
    if (!q) return;
    let query = supabase.from("answers").select("team_name, answer_text, submitted_at").eq("session_pin", sessionPin).eq("question_index", qIndex);
    if (startedAt) query = query.gte("submitted_at", startedAt);
    const { data } = await query.order("submitted_at", { ascending: true });
    const rows = (data as AnswerRow[]) || [];

    const latestByTeam = new Map<string, AnswerRow>();
    for (const a of rows) {
      const prev = latestByTeam.get(a.team_name);
      if (!prev || new Date(a.submitted_at).getTime() > new Date(prev.submitted_at).getTime()) latestByTeam.set(a.team_name, a);
    }

    const nextRace: PursuitRace = {};
    for (const name of teamNames) {
      const entry = race[name] ?? { stage: 0, status: "active" as const };
      if (entry.status !== "active") { nextRace[name] = entry; continue; }
      const correct = checkPursuitAnswer(latestByTeam.get(name)?.answer_text, q);
      const updated = applyOutcome(entry, correct);
      nextRace[name] = updated;
      if (correct) {
        const pts = pursuitStagePoints(updated.stage);
        if (pts > 0) {
          const result = await applyScoreDelta(supabase, sessionPin, name, pts, { roundDelta: 0, eventKey: `pursuit:${sessionId}:${name}:${qIndex}` });
          if (result.scoreboardSyncError) console.error("Pursuit: score updated but scoreboard sync failed:", result.scoreboardSyncError);
        }
      }
    }

    setRace(nextRace);
    setStatus("advance");
    await pushState({ pursuit_status: "advance", pursuit_data: buildPursuitData(nextRace, qIndex, startedAt) });
    onScoreChange?.();
  }

  function finishRound() {
    setStatus("complete");
    pushState({ pursuit_status: "complete" });
  }

  function showResults() {
    setStatus("results");
    pushState({ pursuit_status: "results" });
  }

  function closePanel() {
    setOpen(false);
    setStatus("idle");
    pushState({ pursuit_status: "idle", phase: "waiting", pursuit_data: {}, current_question: null });
    onScoreChange?.();
  }

  const summary = summariseRace(race, teamNames);
  const questionsAsked = qIndex + 1;
  const canAskMore = questionsAsked < pursuitQuestions.length && hasActiveTeams(race, teamNames);
  const currentQuestion = qIndex >= 0 ? pursuitQuestions[qIndex] : null;

  const overlay = (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, maxHeight: "100vh", boxSizing: "border-box" as const, background: "rgba(3,6,12,0.97)", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: 18, padding: 24, overflowY: "auto" }}>
      <div style={{ fontFamily: "'Bruno Ace SC', sans-serif", fontSize: 26, color: "#38bdf8", letterSpacing: 4 }}>THE PURSUIT</div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ padding: "4px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: 1, background: "rgba(56,189,248,0.18)", border: "1px solid rgba(56,189,248,0.5)", color: "#38bdf8" }}>{getPursuitPhaseLabel(status)}</span>
        {qIndex >= 0 && <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Question {qIndex + 1} of {PURSUIT_TOTAL_QUESTIONS}</span>}
      </div>

      {status === "intro" && (
        <div style={{ width: "100%", maxWidth: 680, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,0.4)" }}>PURSUIT ROUND</div>
          {rounds.length === 0 ? (
            <div style={{ fontSize: 13, color: "#fbbf24" }}>No Pursuit rounds yet — create one in the Round Builder (Round Type &rarr; The Pursuit).</div>
          ) : (
            <select
              value={chosenRound?.id ?? ""}
              onChange={(e) => setRoundId(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: 10, background: "#0f0f1a", color: "#fff", border: "1px solid rgba(56,189,248,0.4)", fontSize: 14 }}
            >
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({r.questions.length}q)</option>
              ))}
            </select>
          )}
        </div>
      )}

      {status === "intro" && chosenRound && pursuitQuestions.length < PURSUIT_TOTAL_QUESTIONS && (
        <div style={{ fontSize: 12, color: "#fbbf24" }}>This round has {pursuitQuestions.length} question{pursuitQuestions.length === 1 ? "" : "s"} — The Pursuit expects {PURSUIT_TOTAL_QUESTIONS}.</div>
      )}

      {currentQuestion && status !== "complete" && status !== "results" && (
        <div style={{ width: "100%", maxWidth: 680, padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(56,189,248,0.25)" }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>CURRENT QUESTION</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>{currentQuestion.question_text}</div>
          {status === "reveal" && <div style={{ fontSize: 14, color: "#22c55e", fontWeight: 700, marginTop: 6 }}>Answer: {currentQuestion.correct_answer}</div>}
        </div>
      )}

      <TeamStatus summary={summary} race={race} />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const, justifyContent: "center" }}>
        {status === "intro" && (
          <PrimaryButton disabled={pursuitQuestions.length === 0} onClick={nextQuestion} label={`Start Question 1`} />
        )}
        {status === "question" && <PrimaryButton onClick={revealAnswer} label="Reveal Answer" />}
        {status === "reveal" && <PrimaryButton onClick={advanceRace} label="Advance Race" />}
        {status === "advance" && (
          <>
            {canAskMore && <PrimaryButton onClick={nextQuestion} label={`Next Question (${qIndex + 2})`} />}
            <SecondaryButton onClick={finishRound} label="Finish Round" />
          </>
        )}
        {status === "complete" && <PrimaryButton onClick={showResults} label="Show Results" />}
      </div>

      <button onClick={closePanel} style={{ marginTop: 6, padding: "6px 14px", borderRadius: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer" }}>Close</button>
    </div>
  );

  // The launch button ALWAYS renders inline in the header, so nothing — a stale
  // pursuit_status, refresh recovery, or the overlay's portal — can hide it. The
  // full-screen overlay renders in addition, via a portal to <body>, only while open.
  return (
    <>
      <button onClick={startPursuit} style={{ padding: "6px 14px", borderRadius: 10, background: "rgba(56,189,248,0.25)", border: "1px solid #38bdf8", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}>
        Start The Pursuit
      </button>
      {open && typeof document !== "undefined" ? createPortal(overlay, document.body) : null}
    </>
  );
}

function PrimaryButton({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: "12px 30px", borderRadius: 12, background: disabled ? "rgba(255,255,255,0.08)" : "rgba(56,189,248,0.3)", border: "1px solid " + (disabled ? "rgba(255,255,255,0.2)" : "#38bdf8"), color: "#fff", fontWeight: 700, fontSize: 15, cursor: disabled ? "not-allowed" : "pointer", boxShadow: disabled ? "none" : "0 2px 10px rgba(0,0,0,0.3)" }}>
      {label}
    </button>
  );
}

function SecondaryButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{ padding: "11px 24px", borderRadius: 12, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
      {label}
    </button>
  );
}

function TeamStatus({ summary, race }: { summary: { active: string[]; eliminated: string[]; completed: string[] }; race: PursuitRace }) {
  const groups: { key: keyof typeof summary; label: string; color: string }[] = [
    { key: "active", label: "Remaining", color: "#38bdf8" },
    { key: "completed", label: "Completed", color: "#facc15" },
    { key: "eliminated", label: "Eliminated", color: "#ef4444" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(160px, 1fr))", gap: 12, width: "100%", maxWidth: 680 }}>
      {groups.map((g) => (
        <div key={g.key} style={{ borderRadius: 12, padding: 12, background: "rgba(255,255,255,0.03)", border: "1px solid " + g.color + "44" }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: g.color, marginBottom: 8, fontWeight: 700 }}>{g.label.toUpperCase()} · {summary[g.key].length}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {summary[g.key].map((name) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                <span style={{ color: g.color, fontWeight: 700 }}>{pursuitTotalPoints(race[name]?.stage ?? 0)}</span>
              </div>
            ))}
            {summary[g.key].length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>—</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
