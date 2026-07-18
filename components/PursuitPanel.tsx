"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { applyScoreDelta } from "@/lib/quiz/scoreService";
import { teamInitials } from "@/components/TeamBadge";
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
  timerDuration: number;
  onScoreChange?: () => void;
  onActiveChange?: (active: boolean) => void;
};

export function PursuitPanel({ sessionId, sessionPin, teams, rounds, timerDuration, onScoreChange, onActiveChange }: Props) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PursuitPhase>("idle");
  const [race, setRace] = useState<PursuitRace>({});
  const [qIndex, setQIndex] = useState(-1);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [roundId, setRoundId] = useState("");
  // Question timer — reuses the platform's timer_started_at/timer_duration so the
  // Display and handsets count down and lock exactly like a normal round.
  const [timerStartedAt, setTimerStartedAt] = useState<string | null>(null);
  const [timerDur, setTimerDur] = useState<number>(timerDuration);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const spaceLockRef = useRef(false);

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
    setTimerStartedAt((row.timer_started_at as string) || null);
    if (typeof row.timer_duration === "number") setTimerDur(row.timer_duration as number);
  }, []);

  // Local countdown mirror of the platform timer (host-side display + spacebar
  // gate). Answers are "locked" once this reaches 0 — the same rule the handset
  // already enforces on timer expiry.
  useEffect(() => {
    if (!timerStartedAt) { setTimeLeft(null); return; }
    const tick = () => {
      const elapsed = (Date.now() - new Date(timerStartedAt).getTime()) / 1000;
      setTimeLeft(Math.max(0, Math.ceil(timerDur - elapsed)));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => clearInterval(id);
  }, [timerStartedAt, timerDur]);

  const answersLocked = status === "question" && qIndex >= 0 && (timeLeft === null || timeLeft <= 0);

  // Host console data: every team's submitted answer for the current gate, plus
  // the overall standings — so the host is never blind to answers or scores
  // during the Pursuit. Polled (1.5s) off the same authoritative answers/scores
  // tables the race advance already reads. Presentation only; no scoring here.
  const [liveAnswers, setLiveAnswers] = useState<AnswerRow[]>([]);
  const [standings, setStandings] = useState<{ team_name: string; total_points: number }[]>([]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const load = async () => {
      if (qIndex >= 0) {
        let q = supabase.from("answers").select("team_name, answer_text, submitted_at").eq("session_pin", sessionPin).eq("question_index", qIndex);
        if (startedAt) q = q.gte("submitted_at", startedAt);
        const { data } = await q.order("submitted_at", { ascending: true });
        if (active && data) setLiveAnswers(data as AnswerRow[]);
      }
      const { data: sc } = await supabase.from("scores").select("team_name, total_points").eq("session_pin", sessionPin);
      if (active && sc) setStandings((sc as { team_name: string; total_points: number }[]).slice().sort((a, b) => b.total_points - a.total_points));
    };
    load();
    const id = window.setInterval(load, 1500);
    return () => { active = false; clearInterval(id); };
  }, [open, qIndex, startedAt, sessionPin, supabase]);

  // Tell the host page when the overlay is up so its global spacebar handler
  // stands down (the panel drives Space itself while The Pursuit is running).
  useEffect(() => { onActiveChange?.(open); }, [open, onActiveChange]);

  // Space always performs the next logical action, so the host can run the whole
  // round hands-free. Ignored while typing; one action per press (600ms debounce)
  // so a held or double-tapped key can never skip a state.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      if (e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      if (spaceLockRef.current) return;
      spaceLockRef.current = true;
      window.setTimeout(() => { spaceLockRef.current = false; }, 600);
      const canAskMore = qIndex + 1 < pursuitQuestions.length && hasActiveTeams(race, teamNames);
      if (status === "intro") { if (pursuitQuestions.length > 0) nextQuestion(); }
      else if (status === "question") { if (!answersLocked) lockAnswers(); else revealAnswer(); }
      else if (status === "reveal") { advanceRace(); }
      else if (status === "advance") { if (canAskMore) nextQuestion(); else finishRound(); }
      else if (status === "complete") { showResults(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, status, answersLocked, qIndex, race, timeLeft, pursuitQuestions.length]);

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
    const now = new Date().toISOString();
    setQIndex(newIndex);
    setStatus("question");
    // Start the shared platform timer: Display + handsets count down and the
    // handset locks answers automatically on expiry (existing behaviour).
    setTimerStartedAt(now);
    setTimerDur(timerDuration);
    await pushState({
      pursuit_status: "question",
      current_question: q,
      current_question_index: newIndex,
      pursuit_data: buildPursuitData(race, newIndex, startedAt),
      timer_started_at: now,
      timer_duration: timerDuration,
    });
  }

  // Lock Answers: expire the timer now, which is exactly how a normal round locks
  // (handset rejects once the countdown passes zero). No new lock mechanism.
  async function lockAnswers() {
    const backdated = new Date(Date.now() - (timerDur + 3) * 1000).toISOString();
    setTimerStartedAt(backdated);
    setTimeLeft(0);
    await pushState({ timer_started_at: backdated, timer_duration: timerDur });
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,0.4)" }}>CURRENT QUESTION</div>
            {status === "question" && (
              answersLocked
                ? <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "#ef4444" }}>ANSWERS LOCKED</span>
                : <span style={{ fontSize: 20, fontWeight: 800, color: (timeLeft ?? 0) <= 5 ? "#ef4444" : "#38bdf8" }}>{timeLeft ?? "—"}s</span>
            )}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>{currentQuestion.question_text}</div>
          <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 9, background: "rgba(46,224,110,.1)", border: "1px solid rgba(46,224,110,.35)", color: "#2EE06E", fontSize: 14, fontWeight: 800 }}>
            HOST ANSWER: {currentQuestion.correct_answer}
          </div>
        </div>
      )}

      {/* HOST ANSWER CONSOLE — real submitted answers per team (order · badge ·
          name · answer · waiting · correct/incorrect after reveal · eliminated ·
          gate). Never anonymous dots. */}
      {currentQuestion && (status === "question" || status === "reveal") && (() => {
        const latestByTeam = new Map<string, AnswerRow>();
        for (const a of liveAnswers) {
          const prev = latestByTeam.get(a.team_name);
          if (!prev || new Date(a.submitted_at).getTime() > new Date(prev.submitted_at).getTime()) latestByTeam.set(a.team_name, a);
        }
        const ordered = [...latestByTeam.values()].sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
        const orderIndex = new Map(ordered.map((a, i) => [a.team_name, i + 1]));
        return (
          <div style={{ width: "100%", maxWidth: 680, display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,0.4)" }}>ANSWERS IN — SUBMISSION ORDER</div>
            {teamNames.map((name) => {
              const ans = latestByTeam.get(name);
              const rstatus = race[name]?.status ?? "active";
              const eliminated = rstatus === "eliminated";
              const correct = (status === "reveal" && ans && currentQuestion) ? checkPursuitAnswer(ans.answer_text, currentQuestion) : null;
              const ansColor = correct === true ? "#2EE06E" : correct === false ? "#FF3B4E" : "rgba(255,255,255,0.72)";
              return (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid #2E1A52", opacity: eliminated ? 0.5 : 1 }}>
                  <span style={{ width: 18, textAlign: "center", font: "700 11px 'Inter'", color: "#6B5A8E", fontVariantNumeric: "tabular-nums" }}>{ans ? orderIndex.get(name) : "·"}</span>
                  <span className="fbh-crest" style={{ width: 20, height: 20, fontSize: 7, flexShrink: 0 }}>{teamInitials(name)}</span>
                  <span style={{ font: "700 12.5px 'Inter'", color: "#fff", maxWidth: "30%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                  <span style={{ marginLeft: "auto", font: "600 12.5px 'Inter'", color: eliminated ? "#6B5A8E" : ansColor, maxWidth: "42%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {eliminated ? "OUT" : ans ? ans.answer_text : "waiting…"}
                  </span>
                  <span style={{ font: "700 10px 'Inter'", color: "#6B5A8E", letterSpacing: 1, flexShrink: 0 }}>G{race[name]?.stage ?? 0}</span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* OVERALL LEADERBOARD — stays visible through the Pursuit. Overall quiz
          score (total_points) shown alongside Pursuit status/gate, never hidden. */}
      {standings.length > 0 && status !== "intro" && (
        <div style={{ width: "100%", maxWidth: 680 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>OVERALL LEADERBOARD</div>
          {standings.map((s, i) => {
            const rs = race[s.team_name]?.status;
            const stage = race[s.team_name]?.stage ?? 0;
            return (
              <div key={s.team_name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 8, background: rs === "completed" ? "rgba(232,195,106,0.12)" : "rgba(255,255,255,0.03)", border: "1px solid #2E1A52", marginBottom: 4 }}>
                <span style={{ width: 18, font: "800 13px 'Inter'", color: i === 0 ? "#E8C36A" : i === 1 ? "#C9CDD6" : i === 2 ? "#C08A5A" : "rgba(255,255,255,0.4)", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                <span style={{ font: "700 13px 'Inter'", color: "#fff", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.team_name}</span>
                <span style={{ font: "700 10px 'Inter'", color: "#38A8FF", letterSpacing: 1, flexShrink: 0 }}>{rs === "completed" ? "FINISHED" : rs === "eliminated" ? "OUT · G" + stage : "GATE " + stage}</span>
                <span style={{ font: "800 15px 'Inter'", color: "#D94FDC", fontVariantNumeric: "tabular-nums", minWidth: 44, textAlign: "right" }}>{s.total_points}</span>
              </div>
            );
          })}
        </div>
      )}

      <TeamStatus summary={summary} race={race} />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const, justifyContent: "center" }}>
        {status === "intro" && (
          <PrimaryButton disabled={pursuitQuestions.length === 0} onClick={nextQuestion} label={`Start Question 1`} />
        )}
        {status === "question" && !answersLocked && <PrimaryButton onClick={lockAnswers} label="Lock Answers" />}
        {status === "question" && answersLocked && <PrimaryButton onClick={revealAnswer} label="Reveal Answer" />}
        {status === "reveal" && <PrimaryButton onClick={advanceRace} label="Advance Race" />}
        {status === "advance" && (
          <>
            {canAskMore && <PrimaryButton onClick={nextQuestion} label={`Next Question (${qIndex + 2})`} />}
            <SecondaryButton onClick={finishRound} label="Finish Round" />
          </>
        )}
        {status === "complete" && <PrimaryButton onClick={showResults} label="Show Results" />}
      </div>

      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>
        {status === "intro" ? "SPACE: Start Question 1"
          : status === "question" ? (answersLocked ? "SPACE: Reveal Answer" : "SPACE: Lock Answers")
          : status === "reveal" ? "SPACE: Advance Race"
          : status === "advance" ? (canAskMore ? "SPACE: Next Question" : "SPACE: Finish Round")
          : status === "complete" ? "SPACE: Show Results" : ""}
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
