"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PLATFORM_CONFIG } from "@/lib/platform/config";
import { applyScoreDelta } from "@/lib/quiz/scoreService";
import { getTimerForQuestion } from "@/lib/quiz/questionTimer";
import { teamInitials } from "@/components/TeamBadge";
import { PursuitBoard } from "@/components/PursuitBoard";
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
  checkPursuitAnswer,
  pursuitCorrectAnswerText,
  PURSUIT_WINNER_BONUS,
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

// Flat per-correct-answer points, independent of the PURSUIT_WINNER_BONUS
// (100 pts) awarded once at the end to whoever finishes with the highest
// correct count.
const PURSUIT_CORRECT_POINTS = 10;

type PursuitRoundOption = { id: string; name: string; questions: RoundQuestion[] };

type Props = {
  sessionId: string;
  sessionPin: string;
  teams: { team_name: string }[];
  rounds: PursuitRoundOption[];
  timerDuration: number;
  onScoreChange?: () => void;
  onActiveChange?: (active: boolean) => void;
  // Runs the parent's normal end-of-round sequence (sound, marking the round
  // completed, moving the session to "intermission", advancing the round
  // number, and switching the parent's own hostPhase to "round_end" so its
  // Next-Action bar shows "Start Next Round"). Without this, closing Pursuit
  // only ever pushed pursuit_status back to "idle" - the parent's hostPhase
  // never left whatever it was mid-race, so Space did nothing and the host
  // had no way to move on to the next round after a race finished.
  onRoundComplete?: () => void;
  // Set by the host's main round list when a Pursuit round is picked there,
  // so reaching it in the planned running order starts The Pursuit directly
  // instead of requiring the separate always-visible launch button. Each
  // distinct value (including being set to the same round again) triggers
  // one launch - see the effect below.
  autoStartRoundId?: string | null;
};

export function PursuitPanel({ sessionId, sessionPin, teams, rounds, timerDuration, onScoreChange, onActiveChange, onRoundComplete, autoStartRoundId }: Props) {
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

  // Three sub-states of "question": timer not yet started (just revealed),
  // timer running, and timer expired/locked. timeLeft === null covers BOTH
  // "not started" and "already locked" for a normal round's timer mirror, so
  // it's disambiguated here with timerStartedAt.
  const timerNotStarted = status === "question" && qIndex >= 0 && timerStartedAt === null;
  const answersLocked = status === "question" && qIndex >= 0 && timerStartedAt !== null && (timeLeft === null || timeLeft <= 0);

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
      const canAskMore = qIndex + 1 < pursuitQuestions.length;
      if (status === "intro") { if (pursuitQuestions.length > 0) nextQuestion(); }
      else if (status === "question") { if (timerNotStarted) startTimer(); else if (!answersLocked) lockAnswers(); else revealAnswer(); }
      else if (status === "reveal") { advanceRace(); }
      else if (status === "advance") { if (canAskMore) nextQuestion(); else finishRound(); }
      else if (status === "complete") { showResults(); }
      // Was missing entirely - "results" is the terminal state after Show
      // Results, and with no case here the spacebar (and the "Next action"
      // button below) simply did nothing once the race finished, leaving no
      // way to close out Pursuit and return to the normal round-end flow
      // except the browser back button.
      else if (status === "results") { closePanel(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, status, timerNotStarted, answersLocked, qIndex, race, timeLeft, pursuitQuestions.length]);

  // Auto-launch: fires when the host picks a Pursuit round from the main
  // running-order list (app/host/quiz/page.tsx), instead of requiring the
  // separate always-visible "Start The Pursuit" button. lastAutoStartRef
  // guards against re-launching on every render once a value is set - only a
  // genuinely NEW id (a different round, or the same round chosen again after
  // being cleared back to null by the parent) triggers a launch, and it never
  // fires while a Pursuit is already open.
  const lastAutoStartRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoStartRoundId) { lastAutoStartRef.current = null; return; }
    if (open) return;
    if (lastAutoStartRef.current === autoStartRoundId) return;
    lastAutoStartRef.current = autoStartRoundId;
    const match = rounds.find((r) => r.id === autoStartRoundId);
    if (!match) return;
    // startPursuit() only initialises the race/phase - it doesn't read roundId
    // itself, so no ordering issue setting both in the same pass. The next
    // render picks up chosenRound/pursuitQuestions from the new roundId before
    // nextQuestion() can be reached (via Space or the panel's own button).
    // Deferred via setTimeout(...,0), matching the rest of this codebase's
    // pattern for state writes triggered from inside an effect body.
    window.setTimeout(() => {
      setRoundId(match.id);
      startPursuit();
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartRoundId, rounds, open]);

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

  // Realtime echo channel (mirrors The Hard Deck).
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

  // Recovery safety net — unlike the Display screen (which polls sessions on a
  // timer as a fallback for a missed/dropped realtime event), this panel
  // previously relied ONLY on the realtime channel above once open, with no way
  // to recover if an update was ever missed - the race board could get stuck
  // showing stale positions/status with nothing to fix it short of leaving and
  // re-entering the round. Poll while open so a missed event self-heals within
  // a couple of seconds, and also expose a manual "Recover Graphics" button
  // below for an instant re-pull on demand.
  const [recovering, setRecovering] = useState(false);
  const recoverGraphics = useCallback(async () => {
    if (!sessionId) return;
    setRecovering(true);
    const { data } = await supabase.from("sessions").select("*").eq("id", sessionId).single();
    if (data) hydrate(data as Record<string, unknown>);
    setRecovering(false);
  }, [sessionId, supabase, hydrate]);
  useEffect(() => {
    if (!open || !sessionId) return;
    const id = window.setInterval(() => { recoverGraphics(); }, PLATFORM_CONFIG.polling.hostAnswerSafetyMilliseconds);
    return () => window.clearInterval(id);
  }, [open, sessionId, recoverGraphics]);

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

  // Question reveal and timer start are now two separate beats, matching every
  // other round: the question goes out to the Display/handsets first with no
  // clock running (so the host can read it out), then a second Space press
  // ("Start Timer") sets timer_started_at and the countdown begins. Previously
  // both happened in the same nextQuestion() call, starting the clock the
  // instant the question appeared with no chance to read it out first.
  async function nextQuestion() {
    const newIndex = qIndex + 1;
    if (newIndex >= pursuitQuestions.length) return;
    const q = pursuitQuestions[newIndex];
    // Matches the rest of the quiz (app/host/quiz/page.tsx): multiple choice,
    // sequence, multi tap and number get a shorter 15s timer than a written
    // text-answer question, instead of every Pursuit question running on the
    // same flat 30s host-configured timer regardless of type - a 4-option
    // multiple choice question doesn't need as long to answer.
    const questionTimer = getTimerForQuestion(q, timerDuration);
    setQIndex(newIndex);
    setStatus("question");
    setTimerStartedAt(null);
    setTimerDur(questionTimer);
    await pushState({
      pursuit_status: "question",
      current_question: q,
      current_question_index: newIndex,
      pursuit_data: buildPursuitData(race, newIndex, startedAt),
      timer_started_at: null,
      timer_duration: questionTimer,
    });
  }

  async function startTimer() {
    const now = new Date().toISOString();
    const questionTimer = getTimerForQuestion(pursuitQuestions[qIndex], timerDuration);
    setTimerStartedAt(now);
    setTimerDur(questionTimer);
    await pushState({ timer_started_at: now, timer_duration: questionTimer });
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
  // Every team remains in the game for all seven questions. Correct answers add
  // one to its total; wrong/no answers simply leave the total unchanged.
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
      const correct = checkPursuitAnswer(latestByTeam.get(name)?.answer_text, q);
      const updated = applyOutcome(entry, correct);
      nextRace[name] = updated;
      // Flat 10 points per correct answer, on top of the separate 100-point
      // winner bonus finishRound() awards to whoever finishes with the most
      // correct. eventKey is per team+question+round so a re-render or a
      // safety-net poll re-running advanceRace can never double-pay it.
      if (correct) {
        const result = await applyScoreDelta(supabase, sessionPin, name, PURSUIT_CORRECT_POINTS, {
          roundDelta: PURSUIT_CORRECT_POINTS,
          eventKey: `pursuit-correct:${sessionId}:${chosenRound?.id || "round"}:${name}:${qIndex}`,
        });
        if (result.scoreboardSyncError) console.error("Pursuit correct-answer points landed but scoreboard sync failed:", result.scoreboardSyncError);
      }
    }

    setRace(nextRace);
    setStatus("advance");
    await pushState({ pursuit_status: "advance", pursuit_data: buildPursuitData(nextRace, qIndex, startedAt) });
    onScoreChange?.();
  }

  async function finishRound() {
    const highest = Math.max(0, ...teamNames.map(name => race[name]?.stage ?? 0));
    const winners = highest > 0 ? teamNames.filter(name => (race[name]?.stage ?? 0) === highest) : [];
    for (const name of winners) {
      const result = await applyScoreDelta(supabase, sessionPin, name, PURSUIT_WINNER_BONUS, {
        roundDelta: PURSUIT_WINNER_BONUS,
        eventKey: `pursuit-winner:${sessionId}:${chosenRound?.id || "round"}:${name}`,
      });
      if (result.scoreboardSyncError) console.error("Pursuit winner bonus landed but scoreboard sync failed:", result.scoreboardSyncError);
    }
    setStatus("complete");
    await pushState({ pursuit_status: "complete" });
    if (chosenRound?.id) {
      supabase.from("session_rounds").update({ completed_at: new Date().toISOString() }).eq("id", chosenRound.id).then(() => onScoreChange?.());
    }
  }

  function showResults() {
    setStatus("results");
    pushState({ pursuit_status: "results" });
  }

  function closePanel() {
    setOpen(false);
    setStatus("idle");
    // Leave the Pursuit-specific state, but let the parent's own end-of-round
    // sequence (see onRoundComplete) own the actual phase/session_rounds
    // bookkeeping - previously this pushed phase:"waiting" directly, which
    // never told the parent's hostPhase to leave the race, so Space did
    // nothing afterwards and there was no way to move to the next round.
    pushState({ pursuit_status: "idle", pursuit_data: {}, current_question: null });
    onScoreChange?.();
    onRoundComplete?.();
  }

  const summary = summariseRace(race, teamNames);
  const questionsAsked = qIndex + 1;
  const canAskMore = questionsAsked < pursuitQuestions.length;
  const currentQuestion = qIndex >= 0 ? pursuitQuestions[qIndex] : null;

  const overlay = (
    // Restyled onto the same surface/border/shadow tokens the rest of the host
    // console uses (--qi-bg-surface-elevated/--qi-border/--qi-shadow-sm etc,
    // see .qi-mc-desk / .qi-mc-question in globals.css) instead of a bespoke
    // near-black backdrop - Pursuit previously looked like a completely
    // different app bolted on, per direct host feedback ("still look so
    // different from normal rounds").
    <div className="qi-pursuit-host-console" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, maxHeight: "100vh", boxSizing: "border-box" as const, background: "var(--qi-bg-page, #0A0118)", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: 18, padding: 24, overflowY: "auto" }}>
      <div style={{ fontFamily: "'Bruno Ace SC', sans-serif", fontSize: 26, color: "#D94FDC", letterSpacing: 4 }}>THE PURSUIT</div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ padding: "4px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: 1, background: "rgba(217,79,220,0.18)", border: "1px solid rgba(217,79,220,0.5)", color: "#D94FDC" }}>{getPursuitPhaseLabel(status)}</span>
        {qIndex >= 0 && <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Question {qIndex + 1} of {PURSUIT_TOTAL_QUESTIONS}</span>}
      </div>

      {/* THE RUNNING GRAPHIC — the exact same PursuitBoard the Display shows,
          embedded here so the host sees the live race (not just a text answer
          list) without needing a second screen in view. Bounded to a fixed
          card instead of full-stage sizing; PursuitBoard measures its own
          container via ResizeObserver, so it scales its lanes/runners to fit
          this box automatically. */}
      {qIndex >= 0 && status !== "idle" && status !== "waiting" && status !== "intro" && (
        <div style={{ width: "100%", maxWidth: 900, height: "min(52vh, 460px)", position: "relative", borderRadius: "var(--qi-radius-lg, 20px)", overflow: "hidden", border: "1px solid var(--qi-border, rgba(255,255,255,0.14))", boxShadow: "var(--qi-shadow-sm, 0 4px 20px rgba(0,0,0,0.3))", flexShrink: 0 }}>
          <PursuitBoard
            status={status}
            race={race}
            teamNames={teamNames}
            qIndex={qIndex}
            timeLeft={timeLeft}
            questionText={currentQuestion?.question_text ?? null}
            questionCategory={currentQuestion?.question_type ?? null}
            correctAnswer={currentQuestion ? pursuitCorrectAnswerText(currentQuestion) : null}
            style={{ height: "100%", maxHeight: "100%" }}
          />
        </div>
      )}

      {status === "intro" && (
        <div style={{ width: "100%", maxWidth: 680, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,0.4)" }}>PURSUIT ROUND</div>
          {rounds.length === 0 ? (
            <div style={{ fontSize: 13, color: "#fbbf24" }}>No Pursuit rounds yet — create one in the Round Builder (Round Type &rarr; The Pursuit).</div>
          ) : (
            <select
              value={chosenRound?.id ?? ""}
              onChange={(e) => setRoundId(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: 10, background: "#0f0f1a", color: "#fff", border: "1px solid rgba(217,79,220,0.4)", fontSize: 14 }}
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

      {status === "intro" && (
        <div className="qi-pursuit-host-rules" style={{ width: "100%", maxWidth: 760, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 }}>
          <section style={{ padding: "18px 20px", borderRadius: 16, background: "linear-gradient(145deg,rgba(217,79,220,.13),rgba(255,255,255,.035))", border: "1px solid rgba(217,79,220,.38)" }}>
            <div style={{ font: "800 11px 'Inter'", letterSpacing: 2.2, color: "#D94FDC", marginBottom: 12 }}>READ THIS TO THE ROOM</div>
            <div style={{ font: "750 15px/1.45 'Inter'", color: "#fff", marginBottom: 10 }}>Seven questions. Every team plays every question.</div>
            <ul style={{ margin: 0, paddingLeft: 19, color: "#D9CCF2", font: "600 13px/1.55 'Inter'" }}>
              <li>A correct answer moves your team forward one gate.</li>
              <li>A wrong answer leaves you where you are—but you keep playing.</li>
              <li>The highest correct total after all seven wins a {PURSUIT_WINNER_BONUS}-point bonus.</li>
              <li>Tied leaders each receive the bonus.</li>
            </ul>
          </section>
          <section style={{ padding: "18px 20px", borderRadius: 16, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.14)" }}>
            <div style={{ font: "800 11px 'Inter'", letterSpacing: 2.2, color: "#E8C36A", marginBottom: 12 }}>HOST FLOW · USE SPACE</div>
            <ol style={{ margin: 0, paddingLeft: 20, color: "#D9CCF2", font: "600 13px/1.55 'Inter'" }}>
              <li>Show the question and read it aloud.</li>
              <li>Start the timer.</li>
              <li>Lock answers early, or let the timer finish.</li>
              <li>Reveal the correct answer.</li>
              <li>Update the board to add each correct answer.</li>
            </ol>
            <div style={{ marginTop: 12, padding: "8px 10px", borderRadius: 9, background: "rgba(46,224,110,.09)", color: "#2EE06E", font: "700 11px/1.4 'Inter'" }}>The large button always shows your next action. Space performs that action.</div>
          </section>
        </div>
      )}

      {currentQuestion && status !== "complete" && status !== "results" && (
        <div className="qi-pursuit-host-question" style={{ width: "100%", maxWidth: 680, padding: "14px 18px", borderRadius: "var(--qi-radius-md, 12px)", background: "var(--qi-bg-surface-elevated, rgba(255,255,255,0.04))", border: "1px solid var(--qi-border, rgba(217,79,220,0.25))" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,0.4)" }}>CURRENT QUESTION</div>
            {status === "question" && (
              answersLocked
                ? <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "#ef4444" }}>ANSWERS LOCKED</span>
                : timerNotStarted
                ? <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "#fbbf24" }}>TIMER NOT STARTED</span>
                : <span style={{ fontSize: 20, fontWeight: 800, color: (timeLeft ?? 0) <= 5 ? "#ef4444" : "#D94FDC" }}>{timeLeft ?? "—"}s</span>
            )}
          </div>
          <div className="qi-pursuit-host-question-text" style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>{currentQuestion.question_text}</div>
          <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 9, background: "rgba(46,224,110,.1)", border: "1px solid rgba(46,224,110,.35)", color: "#2EE06E", fontSize: 14, fontWeight: 800 }}>
            HOST ANSWER: {currentQuestion.correct_answer}
          </div>
        </div>
      )}

      {/* HOST ANSWER CONSOLE — real submitted answers per team. */}
      {currentQuestion && (status === "question" || status === "reveal") && (() => {
        const latestByTeam = new Map<string, AnswerRow>();
        for (const a of liveAnswers) {
          const prev = latestByTeam.get(a.team_name);
          if (!prev || new Date(a.submitted_at).getTime() > new Date(prev.submitted_at).getTime()) latestByTeam.set(a.team_name, a);
        }
        const ordered = [...latestByTeam.values()].sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
        const orderIndex = new Map(ordered.map((a, i) => [a.team_name, i + 1]));
        return (
          <div className="qi-pursuit-host-answers" style={{ width: "100%", maxWidth: 680, display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,0.4)" }}>ANSWERS IN — SUBMISSION ORDER</div>
            {teamNames.map((name) => {
              const ans = latestByTeam.get(name);
              const correct = (status === "reveal" && ans && currentQuestion) ? checkPursuitAnswer(ans.answer_text, currentQuestion) : null;
              const ansColor = correct === true ? "#2EE06E" : correct === false ? "#FF3B4E" : "rgba(255,255,255,0.72)";
              return (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid #2E1A52" }}>
                  <span style={{ width: 18, textAlign: "center", font: "700 11px 'Inter'", color: "#6B5A8E", fontVariantNumeric: "tabular-nums" }}>{ans ? orderIndex.get(name) : "·"}</span>
                  <span className="fbh-crest" style={{ width: 20, height: 20, fontSize: 7, flexShrink: 0 }}>{teamInitials(name)}</span>
                  <span style={{ font: "700 12.5px 'Inter'", color: "#fff", maxWidth: "30%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                  <span style={{ marginLeft: "auto", font: "600 12.5px 'Inter'", color: ansColor, maxWidth: "42%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ans ? ans.answer_text : "waiting…"}
                  </span>
                  <span style={{ font: "700 10px 'Inter'", color: "#6B5A8E", letterSpacing: 1, flexShrink: 0 }}>{race[name]?.stage ?? 0}/7</span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* OVERALL LEADERBOARD — stays visible through the Pursuit. Overall quiz
          score (total_points) shown alongside Pursuit status/gate, never hidden. */}
      {standings.length > 0 && status !== "intro" && (
        <div className="qi-pursuit-host-standings" style={{ width: "100%", maxWidth: 680 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>OVERALL LEADERBOARD</div>
          {standings.map((s, i) => {
            const rs = race[s.team_name]?.status;
            const stage = race[s.team_name]?.stage ?? 0;
            return (
              <div key={s.team_name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 8, background: rs === "completed" ? "rgba(232,195,106,0.12)" : "rgba(255,255,255,0.03)", border: "1px solid #2E1A52", marginBottom: 4 }}>
                <span style={{ width: 18, font: "800 13px 'Inter'", color: i === 0 ? "#E8C36A" : i === 1 ? "#C9CDD6" : i === 2 ? "#C08A5A" : "rgba(255,255,255,0.4)", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                <span style={{ font: "700 13px 'Inter'", color: "#fff", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.team_name}</span>
                <span style={{ font: "700 10px 'Inter'", color: "#B9A8D9", letterSpacing: 1, flexShrink: 0 }}>{stage}/7 CORRECT</span>
                <span style={{ font: "800 15px 'Inter'", color: "#D94FDC", fontVariantNumeric: "tabular-nums", minWidth: 44, textAlign: "right" }}>{s.total_points}</span>
              </div>
            );
          })}
        </div>
      )}

      <TeamStatus summary={summary} race={race} />

      {(() => {
        const pursuitNextLabel =
          status === "intro" ? "Rules read · Start Question 1"
          : status === "question" ? (timerNotStarted ? "Start Timer" : answersLocked ? "Reveal Answer" : "Lock Answers")
          : status === "reveal" ? "Update Scores"
          : status === "advance" ? (canAskMore ? `Next Question (${qIndex + 2})` : "Finish Round")
          : status === "complete" ? "Show Results"
          // Same gap as the spacebar handler above - "results" had no label
          // at all, so the whole "Next action" button vanished right when the
          // host needed it most (the final screen of the round), with
          // closePanel() (which correctly returns the session to a normal
          // waiting state and closes Pursuit) sitting unreachable.
          : status === "results" ? "Close Pursuit & Continue" : "";
        const pursuitNextHandler =
          status === "intro" ? nextQuestion
          : status === "question" ? (timerNotStarted ? startTimer : answersLocked ? revealAnswer : lockAnswers)
          : status === "reveal" ? advanceRace
          : status === "advance" ? (canAskMore ? nextQuestion : finishRound)
          : status === "complete" ? showResults
          : status === "results" ? closePanel : undefined;
        const showTimer = status === "question" && !answersLocked && !timerNotStarted;
        return pursuitNextLabel ? (
          <button onClick={pursuitNextHandler} disabled={status === "intro" && pursuitQuestions.length === 0} className={`qi-mc-next${showTimer ? " qi-mc-next--timer" : ""}`}>
            <span className="qi-mc-next__eyebrow">Next action</span>
            <span className="qi-mc-next__label">{pursuitNextLabel}</span>
            {showTimer && <span className={`qi-mc-next__timer${(timeLeft ?? 0) <= 5 ? " qi-mc-next__timer--urgent" : ""}`}>{timeLeft ?? "—"}s</span>}
            <span className="qi-mc-next__key">Space ↵</span>
          </button>
        ) : null;
      })()}
      {status === "advance" && canAskMore && <SecondaryButton onClick={finishRound} label="Finish Round Early" />}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button onClick={recoverGraphics} disabled={recovering} title="Re-pull the race board from the last saved state — use this if the graphics ever look stuck or out of sync" style={{ padding: "6px 14px", borderRadius: 10, background: "transparent", border: "1px solid rgba(217,79,220,0.4)", color: recovering ? "rgba(217,79,220,0.4)" : "#D94FDC", fontSize: 12, cursor: recovering ? "default" : "pointer" }}>
          {recovering ? "Recovering…" : "Recover Graphics"}
        </button>
        <button onClick={closePanel} style={{ padding: "6px 14px", borderRadius: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer" }}>Close</button>
      </div>
    </div>
  );

  // Pursuit now starts the same way every other round does: selecting it from
  // the main running-order list, which drives autoStartRoundId -> startPursuit().
  // The standalone always-on-screen button was removed as a redundant second
  // way to start it that lived outside the normal round-selection flow.
  return open && typeof document !== "undefined" ? createPortal(overlay, document.body) : null;
}

function PrimaryButton({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: "12px 30px", borderRadius: 12, background: disabled ? "rgba(255,255,255,0.08)" : "rgba(217,79,220,0.3)", border: "1px solid " + (disabled ? "rgba(255,255,255,0.2)" : "#D94FDC"), color: "#fff", fontWeight: 700, fontSize: 15, cursor: disabled ? "not-allowed" : "pointer", boxShadow: disabled ? "none" : "0 2px 10px rgba(0,0,0,0.3)" }}>
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
  const all = [...summary.active, ...summary.completed, ...summary.eliminated].sort((a, b) => (race[b]?.stage ?? 0) - (race[a]?.stage ?? 0));
  return (
    <div style={{ borderRadius: 12, padding: 12, background: "rgba(255,255,255,0.03)", border: "1px solid #D94FDC44", width: "100%", maxWidth: 680 }}>
      <div style={{ fontSize: 11, letterSpacing: 2, color: "#D94FDC", marginBottom: 8, fontWeight: 700 }}>ALL TEAMS · {all.length}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 4 }}>
        {all.map((name) => (
          <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            <span style={{ color: "#D94FDC", fontWeight: 700 }}>{race[name]?.stage ?? 0}/7</span>
          </div>
        ))}
      </div>
    </div>
  );
}
