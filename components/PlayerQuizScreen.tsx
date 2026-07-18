'use client';
import React, { useEffect, useState, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMediaUrl } from "@/lib/getMediaUrl";
import { UnoPlayerCards } from "@/components/UnoCards";
import { AnswerKeypad } from "@/components/AnswerKeypad";
import { SlotReels } from "@/components/SlotReels";
import { SpinWheel, buildTeamSegments } from "@/components/SpinWheel";
import { PursuitPhase, readPursuitState, readQIndex, PURSUIT_TOTAL_QUESTIONS } from "@/lib/quiz/pursuit";
import { Crest } from "@/components/fable/HandsetStates";
import { teamInitials } from "@/components/TeamBadge";
import { PlayerShell, PlayerStatusBar, PlayerResultBanner } from "@/components/player/PlayerUI";

type Question = {
  question_text: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  option_e: string | null;
  option_f: string | null;
  correct_answer: string;
};

type Phase = "waiting" | "question" | "answer" | "celebration" | "hard_deck" | "intermission" | "spin_to_win" | "quiz_end" | "pursuit";

interface Props {
  teamName: string;
  sessionPin: string;
}

function SequenceQuestion({ options, onSubmit, submitted }: { options: string[]; onSubmit: (ans: string) => void; submitted: boolean }) {
  const [picked, setPicked] = useState<number[]>([]);
  const purple = "#BE26C1";
  const font = "'Inter', sans-serif";
  if (submitted) return null;

  function tapItem(i: number) {
    if (picked.includes(i)) return;
    setPicked(prev => [...prev, i]);
  }
  function resetPicks() { setPicked([]); }
  function submitOrder() {
    const ordered = picked.map(i => options[i]);
    onSubmit(ordered.join(", "));
  }
  const allPicked = picked.length === options.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 4 }}>TAP IN THE CORRECT ORDER</div>
      {options.map((item, i) => {
        const pickedIndex = picked.indexOf(i);
        const isPicked = pickedIndex !== -1;
        return (
          <button key={i} type="button" onClick={() => tapItem(i)} disabled={isPicked}
            style={{
              display: "flex", alignItems: "center", gap: 14, minHeight: 58, padding: "12px 16px", borderRadius: 14,
              background: isPicked ? "rgba(190,38,193,0.22)" : "#1D1140",
              border: "1px solid " + (isPicked ? "#D94FDC" : "#3A2668"),
              boxShadow: isPicked ? "0 0 14px rgba(217,79,220,0.3)" : "none",
              textAlign: "left" as const, cursor: isPicked ? "default" : "pointer", width: "100%",
            }}>
            <span style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
              background: isPicked ? "#8A1B8D" : "#0A0118",
              border: "1px solid " + (isPicked ? "#D94FDC" : "#8A1B8D"),
              color: isPicked ? "#fff" : "#6B5A8E",
              fontWeight: 800, fontSize: 16,
            }}>
              {isPicked ? pickedIndex + 1 : ""}
            </span>
            <span style={{ flex: 1, color: "#fff", font: "700 17px 'Inter'" }}>{item}</span>
          </button>
        );
      })}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button type="button" onClick={resetPicks} disabled={picked.length === 0}
          style={{ flex: 1, minHeight: 56, borderRadius: 14, background: "#150A2E", border: "1px solid #2E1A52", color: picked.length ? "#fff" : "rgba(255,255,255,0.3)", font: "700 15px 'Inter'", cursor: picked.length ? "pointer" : "default" }}>
          RESET
        </button>
        <button type="button" onClick={submitOrder} disabled={!allPicked}
          style={{ flex: 2, minHeight: 56, borderRadius: 14, background: allPicked ? purple : "#150A2E", color: allPicked ? "#fff" : "rgba(255,255,255,0.3)", border: allPicked ? "1px solid #D94FDC" : "1px solid #2E1A52", boxShadow: allPicked ? "0 0 18px rgba(190,38,193,0.35)" : "none", font: "800 18px 'Inter'", letterSpacing: 1, cursor: allPicked ? "pointer" : "default" }}>
          LOCK IN ORDER
        </button>
      </div>
    </div>
  );
}

function PictureQuestion({ imageUrl, questionText, submitted, answerText, setAnswerText, onSubmit, questionIndex, timeLeft, purple, font, bg, teamName, sessionPin, roundNumber, allowPowerCards }: {
  imageUrl: string; questionText: string; submitted: boolean; answerText: string;
  setAnswerText: (v: string) => void; onSubmit: (a: string) => void;
  questionIndex: number; timeLeft: number | null; purple: string; font: string; bg: string;
  teamName: string; sessionPin: string; roundNumber: number; allowPowerCards: boolean;
}) {
  const [imageDismissed, setImageDismissed] = React.useState(false);
  const [imageFailed, setImageFailed] = React.useState(false);

  if (!imageDismissed) {
    return (
      <div onClick={() => setImageDismissed(true)}
        style={{ minHeight:"100vh", background:bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:"pointer", position:"relative", padding:16 }}>
        {!imageFailed ? (
          <img src={imageUrl} alt="Quiz" onError={() => setImageFailed(true)} style={{ maxWidth:"100%", maxHeight:"75vh", borderRadius:16, objectFit:"contain", boxShadow:"0 0 40px rgba(190,38,193,0.3)" }} />
        ) : (
          <div style={{ width:"80%", maxWidth:340, padding:"40px 24px", borderRadius:16, background:"#150A2E", border:"1px solid #2E1A52", textAlign:"center" as const }}>
            <div style={{ font:"800 17px 'Inter'", color:"#fff" }}>Image could not be loaded</div>
            <div style={{ font:"600 14px 'Inter'", color:"#B9A8D9", marginTop:8 }}>Listen for the host to read the question</div>
          </div>
        )}
        <div style={{ marginTop:22, font:"800 16px 'Inter'", color:"#D94FDC", letterSpacing:2 }}>TAP TO ANSWER →</div>
        {timeLeft !== null && timeLeft > 0 && (
          <div style={{ position:"absolute", top:20, right:20, width:44, height:44, borderRadius:"50%", background:timeLeft<=3?"rgba(239,68,68,0.3)":"rgba(190,38,193,0.2)", border:"2px solid "+(timeLeft<=3?"#ef4444":purple), display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:800, color:timeLeft<=3?"#ef4444":purple, fontFamily:font }}>
            {timeLeft}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ height:"100dvh", overflowY:"auto", WebkitOverflowScrolling:"touch" as const, background:bg, display:"flex", flexDirection:"column", padding:20, boxSizing:"border-box" as const, fontFamily:font, color:"#fff" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
        <div style={{ fontSize:11, letterSpacing:3, color:"rgba(255,255,255,0.3)" }}>Q{questionIndex+1} — PICTURE ROUND</div>
      {timeLeft !== null && timeLeft > 0 && (
          <div style={{ marginLeft:"auto", width:40, height:40, borderRadius:"50%", background:timeLeft<=3?"rgba(239,68,68,0.3)":"rgba(190,38,193,0.2)", border:"2px solid "+(timeLeft<=3?"#ef4444":purple), display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:800, color:timeLeft<=3?"#ef4444":purple }}>
            {timeLeft}
          </div>
        )}
      </div>
      {!imageFailed ? (
        <img src={imageUrl} alt="Quiz" onError={() => setImageFailed(true)} style={{ width:"100%", maxHeight:"35vh", objectFit:"contain", borderRadius:12, marginBottom:16 }} />
      ) : (
        <div style={{ width:"100%", padding:"24px 16px", borderRadius:12, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)", textAlign:"center" as const, marginBottom:16 }}>
          <div style={{ fontSize:28, marginBottom:8 }}>🖼️</div>
          <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)", fontFamily:font }}>Image could not be loaded — listen for the host</div>
        </div>
      )}
      <div style={{ fontSize:16, fontWeight:700, lineHeight:1.4, marginBottom:16, color:"#fff" }}>{questionText}</div>
      {!submitted ? (
        <AnswerKeypad mode="text" onSubmit={onSubmit} />
      ) : (
        <div style={{ padding:"14px 18px", borderRadius:12, background:"rgba(190,38,193,0.15)", border:"1px solid rgba(190,38,193,0.4)", textAlign:"center" }}>
          <div style={{ fontSize:15, color:purple, fontWeight:700 }}>Answer Submitted!</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginTop:4 }}>Waiting for host...</div>
        </div>
      )}
      {allowPowerCards ? <div style={{ marginTop:"auto", paddingTop:12 }}>
        <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} roundNumber={roundNumber} enabled={allowPowerCards} />
      </div> : <div className="qi-player-cards-paused">Power Cards unavailable this round</div>}
    </div>
  );
}

export function PlayerQuizScreen({ teamName, sessionPin }: Props) {
  // Prevent the outer document from scrolling while the gameplay screen is
  // mounted. Plain `overflow:hidden` on body is NOT reliably honoured by iOS
  // Safari (a well-documented mobile Safari limitation) - position:fixed on
  // the body is the technique that actually works cross-browser, including
  // iOS. Scoped to this component only, fully restored on unmount (including
  // scroll position), so no other screen is affected.
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width };
    body.style.position = "fixed";
    body.style.top = -scrollY + "px";
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [tappedItems, setTappedItems] = useState<string[]>([]);
  const [mySubmittedDisplay, setMySubmittedDisplay] = useState("");
  const [error, setError] = useState("");
  const [blockUntil, setBlockUntil] = useState<string | null>(null);
  const [blockTeam, setBlockTeam] = useState<string | null>(null);
  const [blockSecondsLeft, setBlockSecondsLeft] = useState(0);
  const [answerText, setAnswerText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [fastestTeamName, setFastestTeamName] = useState<string | null>(null);
  const [fastestSongName, setFastestSongName] = useState<string | null>(null);
  const [fastestPoints, setFastestPoints] = useState(0);
  const [showScoreboardOnPhone, setShowScoreboardOnPhone] = useState(false);
  const [hideLeaderboard, setHideLeaderboard] = useState(false);
  const [allowPowerCards, setAllowPowerCards] = useState(true);
  const [phoneScoreboardData, setPhoneScoreboardData] = useState<{team_name:string; total_points:number}[]>([]);
  const [spinTargetIdx, setSpinTargetIdx] = useState<number | null>(null);
  const [spinNonce, setSpinNonce] = useState<number | null>(null);
  const [hardDeckTeam, setHardDeckTeam] = useState<string | null>(null);
  const [hardDeckStatus, setHardDeckStatus] = useState<string>("idle");
  const [roundNumber, setRoundNumber] = useState<number>(1);
  const [roundName, setRoundName] = useState("");
  const [hardDeckGuess, setHardDeckGuess] = useState<string | null>(null);
  const [stickGamblePressed, setStickGamblePressed] = useState<string | null>(null);
  const [spinOffered, setSpinOffered] = useState(false);
  const [spinChoice, setSpinChoice] = useState<string|null>(null);
  const [hardDeckPotential, setHardDeckPotential] = useState(0);
  const [hardDeckCards, setHardDeckCards] = useState<{rank:number; suit:string}[]>([]);
  const [hardDeckWheelTarget, setHardDeckWheelTarget] = useState<number | null>(null);
  const [hardDeckWheelSpinning, setHardDeckWheelSpinning] = useState(false);
  // THE PURSUIT — handset mirror of pursuit_status + the current question index.
  // During the "question"/"reveal" sub-phases the handset reuses the normal
  // question / answer screens (see the render conditions below).
  const [pursuitStatus, setPursuitStatus] = useState<PursuitPhase>("idle");
  const [pursuitQIndex, setPursuitQIndex] = useState(-1);
  const [sessionStatus, setSessionStatus] = useState<string>("waiting");
  const [allTeamNames, setAllTeamNames] = useState<string[]>([]);
  const [intermissionOffers, setIntermissionOffers] = useState("");
  const [intermissionWhatsapp, setIntermissionWhatsapp] = useState("");
  const [intermissionOtherQuizzes, setIntermissionOtherQuizzes] = useState("");
  const [quizEndRevealedCount, setQuizEndRevealedCount] = useState(0);
  const [quizEndTrophyVisible, setQuizEndTrophyVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastQIndexRef = useRef(-1);
  const lastQTextRef = useRef("");
  const lastPhaseRef = useRef<string>("");
  // Mirrors the display's spin handling: force this handset into the
  // spin_to_win phase as soon as a spin (spin_choice="spin" + a fresh
  // spin_nonce) is seen, independent of whether the `phase` column write was
  // delivered. Without this, a dropped realtime phase update left the handset
  // showing the question/celebration answer-feedback screen during a spin -
  // i.e. the selected contestant appearing to have "answered incorrectly"
  // when no question was in play. Handled-once per nonce so the return trip to
  // "celebration" (nonce cleared) isn't re-forced back into the spin.
  const spinNonceHandledRef = useRef<number | null>(null);


  // Fable handset stage: violet-black (--stage-deep) with a single low bloom.
  // Applied via every branch's `background:bg`, so all handset stages share the
  // approved show language without touching layout or logic.
  const bg = "radial-gradient(ellipse 70% 40% at 50% 38%, rgba(190,38,193,0.12), transparent 70%), #0A0118";
  const purple = "#BE26C1";
  const font = "'Inter', sans-serif";

  // Keep screen awake
  useEffect(() => {
    if (!blockUntil) { setBlockSecondsLeft(0); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(blockUntil).getTime() - Date.now()) / 1000));
      setBlockSecondsLeft(remaining);
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [blockUntil]);
  // Keep the phone awake while the quiz session is ACTIVE. The Screen Wake Lock
  // is auto-released by the OS whenever the tab is hidden or the screen turns
  // off, so it must be re-acquired on visibility/focus and when the sentinel
  // fires its own 'release' event - otherwise the phone starts sleeping mid-game.
  // Released on unmount (player leaves) and when the session ends (status
  // "finished"), which re-runs this effect and skips re-acquiring.
  useEffect(() => {
    const active = sessionStatus !== "finished";
    let sentinel: WakeLockSentinel | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: string) => Promise<WakeLockSentinel> } };
    async function acquire() {
      if (!active || document.visibilityState !== "visible" || !nav.wakeLock || sentinel) return;
      try {
        sentinel = await nav.wakeLock.request("screen");
        sentinel.addEventListener("release", () => {
          sentinel = null;
          // The OS can release the lock spuriously; if we're still visible and the
          // session is active, re-acquire immediately so the screen never sleeps.
          if (active && document.visibilityState === "visible") acquire();
        });
      } catch {}
    }
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    if (active) {
      acquire();
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("focus", acquire);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", acquire);
      if (sentinel) { sentinel.release().catch(() => {}); sentinel = null; }
    };
  }, [sessionStatus]);
  // Backup: a silent looping audio track discourages most mobile browsers from sleeping the screen,
  // since actively playing media is treated differently from an idle tab.
  useEffect(() => {
    const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
    const audio = new Audio(SILENT_WAV);
    audio.loop = true;
    audio.volume = 0.01;
    const tryPlay = () => { audio.play().catch(() => {}); };
    tryPlay();
    document.addEventListener("click", tryPlay, { once: true });
    document.addEventListener("touchstart", tryPlay, { once: true });
    document.addEventListener("visibilitychange", tryPlay);
    return () => {
      audio.pause();
      document.removeEventListener("click", tryPlay);
      document.removeEventListener("touchstart", tryPlay);
      document.removeEventListener("visibilitychange", tryPlay);
    };
  }, []);

  const applySessionDataRef = useRef<(data: Record<string, unknown>) => void>(() => {});

  useEffect(() => {
    applySessionDataRef.current = applySessionData;
  });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function fetchSession() {
      const { data } = await supabase
        .from("sessions")
        .select("phase, status, round_name, current_question, current_question_index, timer_started_at, timer_duration, fastest_team, fastest_song, fastest_points, hard_deck_team, hard_deck_status, hard_deck_potential, hard_deck_cards, hard_deck_wheel_target, hard_deck_wheel_spinning, hard_deck_guess, spin_offered, spin_choice, spin_target_idx, spin_nonce, intermission_offers, intermission_whatsapp, intermission_other_quizzes, block_until, block_team, show_scoreboard, scoreboard_data, hide_leaderboard, allow_power_cards, quiz_end_revealed_count, quiz_end_trophy_visible, pursuit_status, pursuit_data")
        .eq("pin", sessionPin)
        .single();
      if (data) applySessionDataRef.current(data as Record<string, unknown>);
    }

    async function fetchTeamOrder() {
      const { data: teamRows } = await supabase.from("teams").select("team_name").eq("session_pin", sessionPin).order("created_at", { ascending: true });
      if (teamRows) setAllTeamNames(teamRows.map((t: { team_name: string }) => t.team_name));
    }

    fetchSession();
    fetchTeamOrder();

    // Polling every 500ms to keep handset in sync
    const pollInterval = setInterval(fetchSession, 500);
    // Re-poll the team order too. A handset that connected before some teams had
    // joined would otherwise keep a shorter/stale list, so the SAME Hard Deck
    // wheel index would point to a DIFFERENT team than on other phones. Refetching
    // (ordered by created_at, identical query on every device) keeps every handset
    // on the exact same team list the wheel is built from.
    const teamPollInterval = setInterval(fetchTeamOrder, 3000);

    // Mobile browsers throttle or fully pause setInterval (and can drop the
    // realtime websocket) while the phone screen is locked or the tab is
    // backgrounded - a player who steps away mid-question can come back to
    // stale state with no question visible until the next natural event. Force
    // an immediate resync the instant the tab/page becomes visible or focused
    // again, instead of waiting on a timer that may not have been running.
    const onVisible = () => { if (document.visibilityState === "visible") { fetchSession(); fetchTeamOrder(); } };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", fetchSession);

    const channel = supabase
      .channel("player-session-" + sessionPin)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "sessions",
      }, (payload) => {
        if (payload.new && (payload.new as Record<string, unknown>).pin === sessionPin) {
          applySessionDataRef.current(payload.new as Record<string, unknown>);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
      clearInterval(teamPollInterval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", fetchSession);
    };
  }, [sessionPin]);

  function applySessionData(data: Record<string, unknown>) {
    setSessionStatus((data.status as string) || "waiting");
    const newPhase = (data.phase as Phase) || "waiting";
    const newQ = data.current_question as Question | null;
    const newIdx = (data.current_question_index as number) ?? 0;
    const ft = (data.fastest_team as string) || null;
    const spinChoiceVal = (data.spin_choice as string) || null;
    const spinNonceVal = (data.spin_nonce as number) ?? null;

    if (spinChoiceVal === "spin" && spinNonceVal !== null && spinNonceHandledRef.current !== spinNonceVal) {
      spinNonceHandledRef.current = spinNonceVal;
      setPhase("spin_to_win");
    } else {
      setPhase(newPhase);
    }
    setQuestion(newQ);
    setFastestTeamName(ft);
    setFastestSongName((data.fastest_song as string) || null);
    setFastestPoints((data.fastest_points as number) || 0);
    setRoundNumber((data.round_number as number) || 1);
    setRoundName((data.round_name as string) || "");
    const leaderboardHidden = !!data.hide_leaderboard;
    setHideLeaderboard(leaderboardHidden);
    setAllowPowerCards(data.allow_power_cards !== false);
    setShowScoreboardOnPhone(!leaderboardHidden && !!data.show_scoreboard);
    setPhoneScoreboardData((data.scoreboard_data as {team_name:string; total_points:number}[]) || []);
    setSpinTargetIdx((data.spin_target_idx as number) ?? null);
    setSpinNonce((data.spin_nonce as number) ?? null);
    setBlockUntil((data.block_until as string) || null);
    setBlockTeam((data.block_team as string) || null);
    setHardDeckTeam((data.hard_deck_team as string) || null);
    {
      const newHDStatus = (data.hard_deck_status as string) || "idle";
      if (newHDStatus !== "decision") setStickGamblePressed(null);
      setHardDeckStatus(newHDStatus);
    }
    setHardDeckCards((data.hard_deck_cards as {rank:number; suit:string}[]) || []);
    setHardDeckWheelTarget((data.hard_deck_wheel_target as number) ?? null);
    setHardDeckWheelSpinning(!!data.hard_deck_wheel_spinning);
    setHardDeckPotential((data.hard_deck_potential as number) || 0);
    setHardDeckGuess((data.hard_deck_guess as string) || null);
    // THE PURSUIT — hydrate handset mirror (pursuit_status + current question idx).
    const pursuitState = readPursuitState(data);
    const newPursuitStatus = pursuitState.status;
    setPursuitStatus(newPursuitStatus);
    setPursuitQIndex(readQIndex(pursuitState));
    setSpinOffered(!!data.spin_offered);
    setSpinChoice((data.spin_choice as string) || null);
    setIntermissionOffers((data.intermission_offers as string) || "");
    setIntermissionWhatsapp((data.intermission_whatsapp as string) || "");
    setIntermissionOtherQuizzes((data.intermission_other_quizzes as string) || "");
    setQuizEndRevealedCount((data.quiz_end_revealed_count as number) || 0);
    setQuizEndTrophyVisible(!!data.quiz_end_trophy_visible);

    // Reset answer state when phase changes to question, question index changes, OR the question content itself changes (e.g. host used Dump Question to swap content without changing the index)
    const newQText = newQ?.question_text || "";
    // The Pursuit reuses the normal question screen: treat its "question" sub-phase
    // as an effective "question" phase so answer state resets between race questions.
    const inPursuitQuestion = newPhase === "pursuit" && newPursuitStatus === "question";
    const effPhase = inPursuitQuestion ? "question" : newPhase;
    if (effPhase === "question" && (newIdx !== lastQIndexRef.current || lastPhaseRef.current !== "question" || newQText !== lastQTextRef.current)) {
      lastQIndexRef.current = newIdx;
      lastQTextRef.current = newQText;
      setQuestionIndex(newIdx);
      setSelectedAnswer("");
      setAnswerText("");
      setSubmitted(false);
      setTappedItems([]);
      setMySubmittedDisplay("");
    }
    lastPhaseRef.current = effPhase;

    if (data.timer_started_at && data.timer_duration) {
      const started = new Date(data.timer_started_at as string).getTime();
      const duration = data.timer_duration as number;
      const elapsed = Math.floor((Date.now() - started) / 1000);
      const remaining = Math.max(0, duration - elapsed);
      startCountdown(remaining);
    }
  }

  function startCountdown(seconds: number) {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(seconds);
    if (seconds <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function submitAnswer(answer: string, retryCount = 0) {
    if (submitted || !answer.trim()) return;
    if (timeLeft !== null && timeLeft <= -2) {
      setError("Time's up! No more answers accepted for this question.");
      setTimeout(() => setError(""), 2500);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    // AUTHORITATIVE late-answer rejection. The local `timeLeft` is derived from an
    // interval that can lag when the tab is backgrounded or wifi drops, so on the
    // first attempt we re-read the session's timer/phase straight from the DB and
    // reject if the answering window has actually closed. This does not rely on the
    // phone UI being disabled. (A DB-level RLS/trigger would be even stronger but
    // requires a Supabase policy change, which is out of scope for this pass.)
    if (retryCount === 0) {
      const { data: live } = await supabase.from("sessions")
        .select("phase, current_question_index, timer_started_at, timer_duration")
        .eq("pin", sessionPin).maybeSingle();
      if (live) {
        const phase = live.phase as string;
        const answering = phase === "question" || phase === "timer" || phase === "pursuit";
        const movedOn = (phase === "question" || phase === "timer")
          && typeof live.current_question_index === "number"
          && live.current_question_index !== questionIndex;
        const started = live.timer_started_at ? new Date(live.timer_started_at as string).getTime() : null;
        const dur = typeof live.timer_duration === "number" ? live.timer_duration : null;
        // 1.5s network grace, matching the existing client-side allowance.
        const expired = started !== null && dur !== null && Date.now() > started + dur * 1000 + 1500;
        if (!answering || movedOn || expired) {
          setError("Time's up! No more answers accepted for this question.");
          setTimeout(() => setError(""), 2500);
          return;
        }
      }
    }
    // Optimistically show locked-in, but verify the write actually succeeded -
    // on flaky venue wifi the insert can silently fail while the UI still says "locked in".
    setSubmitted(true);
    const { error } = await supabase.from("answers").insert({
      session_pin: sessionPin,
      team_name: teamName,
      question_index: questionIndex,
      answer_text: answer.trim(),
    });
    if (error) {
      if (retryCount < 2) {
        // Quick silent retry first (covers brief connection blips)
        setTimeout(() => { setSubmitted(false); submitAnswer(answer, retryCount + 1); }, 800);
      } else {
        setSubmitted(false);
        setError("Connection issue - your answer didn't save. Please try again.");
        setTimeout(() => setError(""), 4000);
      }
    }
  }

  async function submitHardDeckGuess(guess: "higher" | "lower") {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ hard_deck_guess: guess }).eq("pin", sessionPin);
  }

  async function submitHardDeckStick() {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ hard_deck_status: "won" }).eq("pin", sessionPin);
  }

  async function submitHardDeckGamble() {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ hard_deck_status: "awaiting_guess" }).eq("pin", sessionPin);
  }

  async function chooseSpin() {
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.from("sessions").update({ spin_choice: "spin" }).eq("pin", sessionPin);
    if (err) {
      console.error("chooseSpin failed:", err);
      setError("Could not register your spin choice - please try again.");
      setTimeout(() => setError(""), 4000);
    }
  }

  async function choosePass() {
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.from("sessions").update({ spin_choice: "pass" }).eq("pin", sessionPin);
    if (err) {
      console.error("choosePass failed:", err);
      setError("Could not register your choice - please try again.");
      setTimeout(() => setError(""), 4000);
    }
  }

  function getCorrectAnswerText(q: Question): string {
    if (q.question_type === "multiple_choice") {
      const key = q.correct_answer.toLowerCase();
      const map: Record<string, string | null> = { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d };
      return map[key] || q.correct_answer;
    }
    if (q.question_type === "sequence") {
      const map: Record<string, string | null> = { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d };
      const order = q.correct_answer.split(",").map(s => s.trim().toLowerCase());
      const texts = order.map(key => map[key]).filter((t): t is string => !!t);
      if (texts.length === order.length) return texts.join(", ");
      return q.correct_answer;
    }
    return q.correct_answer;
  }

  const PowerCards = () => (
    allowPowerCards ? <div style={{ flexShrink: 0, paddingTop: 10, paddingBottom: 4, borderTop: "1px solid rgba(255,255,255,0.06)", background: bg }}>
      <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} roundNumber={roundNumber} compact={true} enabled={allowPowerCards} />
    </div> : <div className="qi-player-cards-paused">Power Cards unavailable this round</div>
  );

  if (showScoreboardOnPhone && !hideLeaderboard && phase !== "quiz_end") {
    const sorted = [...phoneScoreboardData].sort((a,b) => b.total_points - a.total_points);
    return (
      <PlayerShell className="qi-player-leaderboard">
        <PlayerStatusBar teamName={teamName} roundName={roundName} powerCardsEnabled={allowPowerCards} />
        <div style={{ fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", fontSize: 18, color: purple, letterSpacing: ".24em", textAlign: "center" as const, marginBottom: 20, textShadow: "0 0 24px rgba(190,38,193,.5)" }}>LEADERBOARD</div>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
          {sorted.map((s, i) => (
            <div key={s.team_name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 16, background: s.team_name === teamName ? "rgba(190,38,193,0.2)" : "rgba(255,255,255,0.05)", border: s.team_name === teamName ? "1.5px solid " + purple : "1px solid rgba(46,26,82,0.9)", boxShadow: "0 2px 6px rgba(5,0,13,0.4)" }}>
              <span style={{ fontWeight: 800, color: i === 0 ? "#E8C36A" : i === 1 ? "#C9CDD6" : i === 2 ? "#C08A5A" : "rgba(255,255,255,0.4)", minWidth: 24, fontVariantNumeric: "tabular-nums" }}>{i+1}.</span>
              <span style={{ flex: 1, fontWeight: 700 }}>{s.team_name}</span>
              <span style={{ fontWeight: 900, color: purple, fontSize: 18 }}>{s.total_points}</span>
            </div>
          ))}
        </div>
      </PlayerShell>
    );
  }
  if (phase === "spin_to_win") {
    const isWinner = fastestTeamName === teamName;
    return (
      <div className="qi-player-state qi-player-spin" style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, gap: 12, textAlign: "center" as const }}>
        {!isWinner && (
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
            {fastestTeamName ? fastestTeamName + " is spinning..." : "Spinning..."}
          </div>
        )}
        {/* Every player sees their own synced mini wheel - not just the spinning team -
            so remote players who can't see the venue display still see the result live. */}
        <div style={{ width: "100%" }}>
          <SlotReels targetIdx={spinTargetIdx} spinNonce={spinNonce} teamName={fastestTeamName || teamName} victorySong={isWinner ? (fastestSongName || undefined) : undefined} size="compact" audioEnabled={false} />
        </div>
      </div>
    );
  }
  if (sessionStatus === "finished") {
    return (
      <div className="fbl fbl-phone qi-player-state qi-player-session-complete" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 16, textAlign: "center" }}>
        <div style={{ position: "relative", zIndex: 2, fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", fontSize: "clamp(22px,7vw,30px)", letterSpacing: ".08em", textShadow: "0 0 24px rgba(190,38,193,.5)" }}>THAT&apos;S A WRAP</div>
        <div style={{ position: "relative", zIndex: 2, font: "600 clamp(14px,4vw,16px) 'Inter'", color: "#B9A8D9" }}>Thanks for playing — same tables next week.</div>
      </div>
    );
  }
  if (phase === "hard_deck") {
    const isSelected = hardDeckTeam === teamName;
    const rankLabels: Record<number,string> = { 1:"A", 11:"J", 12:"Q", 13:"K" };
    const rankLabel = (r: number) => rankLabels[r] || String(r);
    return (
      <div className="qi-player-state qi-player-hard-deck" style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 16, textAlign: "center" as const }}>
        <PlayerStatusBar teamName={teamName} roundName="The Hard Deck" powerCardsEnabled={false} />
        <div style={{ fontFamily: "'Bruno Ace SC', sans-serif", fontSize: (hardDeckTeam && hardDeckStatus !== "wheel") ? 14 : 20, color: (hardDeckTeam && hardDeckStatus !== "wheel") ? "rgba(190,38,193,0.5)" : purple, letterSpacing: (hardDeckTeam && hardDeckStatus !== "wheel") ? 2 : 3, fontWeight: (hardDeckTeam && hardDeckStatus !== "wheel") ? 600 : 400 }}>THE HARD DECK</div>

        {/* Everyone sees the same team-select wheel and card faces, not just text -
            so remote players who can't see the venue display can still follow along. */}
        {hardDeckStatus === "wheel" && hardDeckWheelTarget !== null && (
          <div style={{ width: "100%", maxWidth: 280 }}>
            <SpinWheel
              segments={buildTeamSegments(allTeamNames)}
              onResult={() => {}}
              size={240}
              forceResultIndex={hardDeckWheelTarget}
              autoSpin={hardDeckWheelSpinning}
              allowManualSpin={false}
            />
          </div>
        )}

        {hardDeckTeam && hardDeckStatus !== "wheel" && (
          <div style={{ fontSize: isSelected ? 28 : 20, color: isSelected ? "#D94FDC" : "#fff", fontWeight: 800, letterSpacing: 1 }}>
            {isSelected ? "IT'S YOU" : hardDeckTeam}
          </div>
        )}

        {hardDeckCards.length > 0 && (
          <div style={{ padding: "clamp(8px,3vw,16px)", borderRadius: 18, maxWidth: "96vw", boxSizing: "border-box" as const, background: "linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))", border: "1px solid rgba(190,38,193,0.25)", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05), inset 0 -1px 16px rgba(0,0,0,0.4), 0 0 24px rgba(190,38,193,0.15)" }}>
            {/* Card size is viewport-relative so all five cards fit across a phone
                with no horizontal overflow/scroll. */}
            <div style={{ display: "flex", gap: "clamp(4px,1.5vw,12px)", justifyContent: "center", flexWrap: "nowrap" as const }}>
              {hardDeckCards.map((c, i) => (
                <div key={i} style={{ width: "min(90px,16vw)", height: "min(128px,23vw)", flexShrink: 0, borderRadius: 12, background: "linear-gradient(160deg, #ffffff 0%, #f2f2f5 100%)", border: "1px solid rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: "min(28px,5.5vw)", fontWeight: 900, color: (c.suit === "♥" || c.suit === "♦") ? "#dc2626" : "#111", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -8px 12px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(212,175,90,0.3)" }}>
                  <div>{rankLabel(c.rank)}</div>
                  <div style={{ fontSize: "min(34px,7vw)" }}>{c.suit}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isSelected && hardDeckStatus !== "wheel" && (
          <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.65)" }}>
            {hardDeckStatus === "awaiting_guess" ? "Higher or Lower?" : hardDeckStatus === "decision" ? "Stick or Gamble?" : ""}
          </div>
        )}

        {isSelected && hardDeckStatus === "awaiting_guess" && (
          <div style={{ display: "flex", gap: 16, width: "100%", maxWidth: 380 }}>
            <button
              onClick={() => submitHardDeckGuess("higher")}
              disabled={!!hardDeckGuess}
              style={{
                flex: 1, minHeight: 132, borderRadius: 18, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                background: hardDeckGuess === "higher" ? "rgba(232,195,106,0.28)" : "#1D1140",
                border: hardDeckGuess === "higher" ? "3px solid #E8C36A" : "2px solid rgba(232,195,106,0.7)",
                color: "#fff", cursor: hardDeckGuess ? "default" : "pointer",
                transform: hardDeckGuess === "higher" ? "scale(1.04)" : "scale(1)",
                opacity: hardDeckGuess && hardDeckGuess !== "higher" ? 0.35 : 1,
                transition: "all 0.15s ease",
              }}
            ><span aria-hidden style={{ fontSize: 40, lineHeight: 1, color: "#E8C36A" }}>▲</span><span style={{ font: "800 26px 'Inter'", letterSpacing: ".06em" }}>HIGHER</span></button>
            <button
              onClick={() => submitHardDeckGuess("lower")}
              disabled={!!hardDeckGuess}
              style={{
                flex: 1, minHeight: 132, borderRadius: 18, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                background: hardDeckGuess === "lower" ? "rgba(190,38,193,0.32)" : "#1D1140",
                border: hardDeckGuess === "lower" ? "3px solid #D94FDC" : "2px solid #8A1B8D",
                color: "#fff", cursor: hardDeckGuess ? "default" : "pointer",
                boxShadow: hardDeckGuess === "lower" ? "0 0 18px rgba(190,38,193,0.4)" : "none",
                transform: hardDeckGuess === "lower" ? "scale(1.04)" : "scale(1)",
                opacity: hardDeckGuess && hardDeckGuess !== "lower" ? 0.35 : 1,
                transition: "all 0.15s ease",
              }}
            ><span aria-hidden style={{ fontSize: 40, lineHeight: 1, color: "#D94FDC" }}>▼</span><span style={{ font: "800 26px 'Inter'", letterSpacing: ".06em" }}>LOWER</span></button>
          </div>
        )}
        {isSelected && hardDeckStatus === "decision" && (
          <>
            <div style={{ font: "700 18px 'Inter'", color: "#E8C36A" }}>You have {hardDeckPotential} points!</div>
            <div style={{ display: "flex", gap: 16, width: "100%", maxWidth: 360 }}>
              <button
                onClick={() => { setStickGamblePressed("stick"); submitHardDeckStick(); }}
                disabled={!!stickGamblePressed}
                style={{
                  flex: 1, minHeight: 80, borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                  background: stickGamblePressed === "stick" ? "rgba(232,195,106,0.25)" : "#150A2E",
                  border: stickGamblePressed === "stick" ? "2px solid #E8C36A" : "1px solid rgba(232,195,106,0.55)",
                  color: "#fff", cursor: stickGamblePressed ? "default" : "pointer",
                  transform: stickGamblePressed === "stick" ? "scale(1.04)" : "scale(1)",
                  opacity: stickGamblePressed && stickGamblePressed !== "stick" ? 0.4 : 1,
                  transition: "all 0.15s ease",
                }}
              ><span style={{ font: "800 18px 'Inter'", letterSpacing: ".08em" }}>STICK</span><span style={{ font: "600 11px 'Inter'", color: "#B9A8D9", letterSpacing: ".1em" }}>BANK {hardDeckPotential}</span></button>
              <button
                onClick={() => { setStickGamblePressed("gamble"); submitHardDeckGamble(); }}
                disabled={!!stickGamblePressed}
                style={{
                  flex: 1, minHeight: 80, borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                  background: stickGamblePressed === "gamble" ? "rgba(190,38,193,0.3)" : "#150A2E",
                  border: stickGamblePressed === "gamble" ? "2px solid #D94FDC" : "1px solid #8A1B8D",
                  color: "#fff", cursor: stickGamblePressed ? "default" : "pointer",
                  boxShadow: stickGamblePressed === "gamble" ? "0 0 18px rgba(190,38,193,0.35)" : "none",
                  transform: stickGamblePressed === "gamble" ? "scale(1.04)" : "scale(1)",
                  opacity: stickGamblePressed && stickGamblePressed !== "gamble" ? 0.4 : 1,
                  transition: "all 0.15s ease",
                }}
              ><span style={{ font: "800 18px 'Inter'", letterSpacing: ".08em" }}>GAMBLE</span><span style={{ font: "600 11px 'Inter'", color: "#B9A8D9", letterSpacing: ".1em" }}>NEXT CARD</span></button>
            </div>
          </>
        )}
        {hardDeckStatus === "won" && (
          <div style={{ font: "800 22px 'Inter'", color: "#2EE06E", letterSpacing: 0.5 }}>{isSelected ? "You won" : hardDeckTeam + " won"} {hardDeckPotential} points!</div>
        )}
        {hardDeckStatus === "lost" && (
          <div style={{ font: "800 22px 'Inter'", color: "#FF3B4E", letterSpacing: 0.5 }}>{isSelected ? "Bust — better luck next time!" : hardDeckTeam + " busted!"}</div>
        )}
      </div>
    );
  }

  // THE PURSUIT — non-question sub-phases only. The "question" and "reveal"
  // sub-phases fall through to the normal question / answer screens below (their
  // render conditions include the pursuit sub-phase), so every team answers the
  // pursuit question exactly as it answers any other — no special screens.
  if (phase === "pursuit" && pursuitStatus !== "question" && pursuitStatus !== "reveal") {
    const message =
      pursuitStatus === "intro" ? "Seven questions. One wrong answer and you're out. Get ready!"
      : pursuitStatus === "advance" ? "Runners are moving — watch the big screen!"
      : pursuitStatus === "complete" || pursuitStatus === "results" ? "That's the finish. Final standings on the big screen."
      : "The Pursuit is starting soon…";
    return (
      <div className="qi-player-state qi-player-pursuit" style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 16, textAlign: "center" as const, fontFamily: font }}>
        <PlayerStatusBar teamName={teamName} roundName="The Pursuit" powerCardsEnabled={false} />
        <div style={{ fontFamily: "'Bruno Ace SC', sans-serif", fontSize: 22, color: "#38bdf8", letterSpacing: 3 }}>THE PURSUIT</div>
        {pursuitQIndex >= 0 && pursuitStatus === "advance" && (
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.6)" }}>QUESTION {pursuitQIndex + 1} / {PURSUIT_TOTAL_QUESTIONS}</div>
        )}
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", maxWidth: 300 }}>{message}</div>
      </div>
    );
  }

  if (phase === "intermission") {
    const hasContent = intermissionOffers || intermissionWhatsapp || intermissionOtherQuizzes;
    return (
      <div className="qi-player-state qi-player-intermission" style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 16, textAlign: "center" as const, fontFamily: font }}>
        <div style={{ fontSize: 22, color: purple, letterSpacing: 4, fontWeight: 700 }}>INTERMISSION</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>Next round starting soon...</div>
        {!hasContent && (
          <img src="/me-logo.jpg" alt="ME" style={{ width: 70, height: 70, borderRadius: "50%", border: "2px solid " + purple, marginTop: 12 }} />
        )}
        {intermissionOffers && (
          <div style={{ padding: "16px 18px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(190,38,193,0.4)", width: "100%", maxWidth: 340 }}>
            <div style={{ fontSize: 11, color: purple, letterSpacing: 2, marginBottom: 6 }}>TONIGHT'S OFFERS</div>
            <div style={{ fontSize: 15, color: "#fff", lineHeight: 1.4 }}>{intermissionOffers}</div>
          </div>
        )}
        {intermissionWhatsapp && (
          <div style={{ padding: "16px 18px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(190,38,193,0.4)", width: "100%", maxWidth: 340 }}>
            <div style={{ fontSize: 11, color: purple, letterSpacing: 2, marginBottom: 10 }}>JOIN OUR WHATSAPP</div>
            <img src={"https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=" + encodeURIComponent(intermissionWhatsapp)} alt="WhatsApp QR" style={{ width: 140, height: 140, borderRadius: 10, background: "#fff", padding: 6 }} />
          </div>
        )}
        {intermissionOtherQuizzes && (
          <div style={{ padding: "16px 18px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(190,38,193,0.4)", width: "100%", maxWidth: 340 }}>
            <div style={{ fontSize: 11, color: purple, letterSpacing: 2, marginBottom: 6 }}>MORE QUIZ NIGHTS</div>
            <div style={{ fontSize: 14, color: "#fff", lineHeight: 1.4 }}>{intermissionOtherQuizzes}</div>
          </div>
        )}
      </div>
    );
  }
  if (phase === "celebration") {
    const isWinnerForSpin = fastestTeamName === teamName;
    if (isWinnerForSpin && spinOffered && !spinChoice) {
      return (
        <div className="qi-player-state qi-player-spin-choice" style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 24, textAlign: "center" as const }}>
          <div style={{ fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", fontSize: 24, letterSpacing: ".12em", textShadow: "0 0 24px rgba(190,38,193,.6)" }}><span style={{ color: "#BE26C1" }}>SPIN</span> TO WIN</div>
          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(255,59,78,0.12)", border: "1px solid rgba(255,59,78,0.5)", color: "#FF3B4E", font: "600 13px 'Inter'", textAlign: "center" as const }}>{error}</div>
          )}
          <button onClick={chooseSpin} style={{ width: "min(64vw,260px)", aspectRatio: "1", borderRadius: "50%", background: "radial-gradient(circle at 50% 40%, rgba(217,79,220,0.35), #150A2E 72%)", border: "2px solid #D94FDC", color: "#fff", font: "800 34px 'Inter'", letterSpacing: ".2em", cursor: "pointer", boxShadow: "0 0 46px rgba(190,38,193,0.5)" }}>SPIN</button>
          <button onClick={choosePass} style={{ width: "100%", maxWidth: 320, minHeight: 64, borderRadius: 16, background: "#150A2E", border: "1px solid #2E1A52", color: "#B9A8D9", font: "700 18px 'Inter'", letterSpacing: ".2em", cursor: "pointer" }}>PASS</button>
        </div>
      );
    }
    const isWinner = fastestTeamName === teamName;
    const confettiColors = ["#BE26C1","#fbbf24","#22c55e","#38bdf8","#f87171","#a78bfa"];
    return (
      <div className="qi-player-state qi-player-celebration" style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: font, position: "relative", overflow: "hidden" }}>
        <style>{`
          @keyframes fall { 0% { transform: translateY(-20px) rotate(0deg); opacity:1; } 100% { transform: translateY(110vh) rotate(720deg); opacity:0; } }
          @keyframes flash { 0%,100%{opacity:1} 50%{opacity:0.15} }
        `}</style>
        {isWinner && Array.from({length: 24}).map((_, i) => (
          <div key={i} style={{
            position: "absolute", top: "-10px",
            left: (4 + (i * 17) % 92) + "%",
            width: 8 + (i % 4) * 3, height: 8 + (i % 3) * 3,
            borderRadius: i % 3 === 0 ? "50%" : 2,
            background: confettiColors[i % confettiColors.length],
            animation: `fall ${1.5 + (i % 8) * 0.3}s ease-in ${(i % 6) * 0.2}s infinite`,
            opacity: 0.9, pointerEvents: "none" as const,
          }} />
        ))}
        {fastestTeamName && (
          <>
            {isWinner && spinOffered && !spinChoice && (
              <div style={{ marginBottom: 20, textAlign: "center" as const }}>
                <div style={{ fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", fontSize: 16, color: "#D94FDC", marginBottom: 12, letterSpacing: ".1em" }}>SPIN TO WIN?</div>
                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                  <button onClick={chooseSpin} style={{ padding: "14px 28px", borderRadius: 14, background: "#BE26C1", border: "1px solid #D94FDC", color: "#fff", font: "700 16px 'Inter'", letterSpacing: ".08em", cursor: "pointer", boxShadow: "0 0 18px rgba(190,38,193,0.35)" }}>SPIN</button>
                  <button onClick={choosePass} style={{ padding: "14px 28px", borderRadius: 14, background: "#150A2E", border: "1px solid #2E1A52", color: "#B9A8D9", font: "700 16px 'Inter'", letterSpacing: ".08em", cursor: "pointer" }}>PASS</button>
                </div>
              </div>
            )}
            {isWinner && spinChoice === "spin" && (
              <div style={{ font: "700 16px 'Inter'", color: "#B9A8D9", marginBottom: 20, textAlign: "center" as const }}>Spinning… watch the big screen!</div>
            )}
            {isWinner && spinChoice === "pass" && (
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 20, textAlign: "center" as const }}>You passed on the spin</div>
            )}
          <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", letterSpacing: 3, textAlign: "center", lineHeight: 1.2, marginBottom: 20, animation: "flash 0.8s ease-in-out infinite", textShadow: "0 0 20px rgba(255,255,255,0.6)" }}>FASTEST<br/>CORRECT ANSWER</div>
          </>
        )}
        {isWinner ? (
          <>
            <Crest initials={teamInitials(fastestTeamName || teamName)} size={88} gold />
            <div style={{ fontSize: 42, fontWeight: 900, color: purple, letterSpacing: 2, textAlign: "center", textShadow: "0 0 40px rgba(190,38,193,0.8)", margin: "8px 0" }}>{fastestTeamName}</div>
            <div style={{ font: "800 18px 'Inter'", color: "#E8C36A", letterSpacing: 2, marginBottom: 24 }}>{"That's you!"}</div>
            {/* Only show a points award when points were genuinely awarded. A
                "+0" is never a success state — show a neutral line instead.
                fastest_points comes from the session row the host writes AFTER
                the score is committed, so this reflects the stored award, not a
                pre-calculated estimate. */}
            {fastestPoints > 0 ? (
              <div style={{ padding: "20px 40px", borderRadius: 20, background: "rgba(46,224,110,0.15)", border: "2px solid rgba(46,224,110,0.5)", marginBottom: 32, textAlign: "center" }}>
                <div style={{ font: "700 12px 'Inter'", letterSpacing: 3, color: "#2EE06E", marginBottom: 4 }}>POINTS AWARDED</div>
                <div style={{ font: "900 56px 'Inter'", color: "#2EE06E", textShadow: "0 0 20px rgba(46,224,110,0.6)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>+{fastestPoints}</div>
              </div>
            ) : (
              <div style={{ font: "700 18px 'Inter'", color: "#B9A8D9", marginBottom: 32, textAlign: "center" }}>No points this time</div>
            )}
          </>
        ) : (() => {
          const correctText = question ? getCorrectAnswerText(question) : "";
          const myAnswerCorrect = !!mySubmittedDisplay && mySubmittedDisplay.trim().toLowerCase() === correctText.trim().toLowerCase();
          return (
            <>
              {fastestTeamName && (
                <div style={{ fontSize: 32, fontWeight: 900, color: purple, letterSpacing: 2, textAlign: "center", textShadow: "0 0 24px rgba(190,38,193,0.6)", marginBottom: 16 }}>{fastestTeamName}</div>
              )}
              {myAnswerCorrect ? (
                <>
                <div style={{ fontSize: 16, color: "#22c55e", fontWeight: 700, marginBottom: 6 }}>Your answer was correct</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 24 }}>{fastestTeamName ? "Just not the fastest this time" : "Nice work!"}</div>
                </>
              ) : (
                <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                  <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ fontSize: 10, letterSpacing: 1, color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>YOUR ANSWER</div>
                    <div style={{ fontSize: 14, color: "#fff" }}>{mySubmittedDisplay || "(no answer submitted)"}</div>
                  </div>
                  <div style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ fontSize: 10, letterSpacing: 1, color: "rgba(134,239,172,0.7)", marginBottom: 4 }}>CORRECT ANSWER</div>
                    <div style={{ fontSize: 14, color: "#86efac" }}>{correctText}</div>
                  </div>
                </div>
              )}
            </>
          );
        })()}
        {allowPowerCards ? <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} roundNumber={roundNumber} compact={true} enabled={allowPowerCards} /> : <div className="qi-player-cards-paused">Power Cards unavailable this round</div>}
      </div>
    );
  }

  if ((phase === "answer" || (phase === "pursuit" && pursuitStatus === "reveal")) && question) {
    const correctText = getCorrectAnswerText(question);
    // Authoritative verdict only for multiple choice, where the picked key vs the
    // correct key is exactly what scoring compares — never a guessed/fuzzy verdict
    // that could disagree with the score. Other types show the correct answer.
    const isMC = question.question_type === "multiple_choice";
    const mcVerdict = isMC && submitted && selectedAnswer
      ? (selectedAnswer.toLowerCase() === (question.correct_answer || "").trim().toLowerCase())
      : null;
    return (
      <div className={"fbl fbl-phone qi-player-state qi-player-answer" + (mcVerdict === true ? " is-correct" : mcVerdict === false ? " is-incorrect" : "")} style={{ minHeight: "100vh", display: "flex", flexDirection: "column", padding: 20 }}>
        <PlayerStatusBar teamName={teamName} roundName={roundName} powerCardsEnabled={allowPowerCards} />
        {mcVerdict === true ? (
          /* The player's whole moment: did I get it? — one dominant answer. */
          <div style={{ position: "relative", zIndex: 2, margin: "auto 0", textAlign: "center" }}>
            <PlayerResultBanner tone="correct" title="CORRECT">{correctText}</PlayerResultBanner>
          </div>
        ) : (
          <>
            <div style={{ position: "relative", zIndex: 2, fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", fontSize: 14, letterSpacing: ".14em", color: "#B9A8D9", marginBottom: 12 }}>ANSWER REVEALED</div>
            <div style={{ position: "relative", zIndex: 2, font: "700 clamp(15px,4.2vw,17px) 'Inter'", lineHeight: 1.4, marginBottom: 16, color: "rgba(255,255,255,0.6)" }}>{question.question_text.replace(/^Play this track:\s*/i, "").replace(/^Show teams this image:\s*/i, "")}</div>
            <div style={{ position: "relative", zIndex: 2, padding: "18px 20px", borderRadius: 16, background: "rgba(46,224,110,0.15)", border: "1px solid rgba(46,224,110,0.5)", marginBottom: 14 }}>
              <div style={{ font: "700 13px 'Inter'", color: "#2EE06E", letterSpacing: ".18em", marginBottom: 6 }}>CORRECT ANSWER</div>
              <div style={{ font: "800 clamp(24px,7vw,32px) 'Inter'", color: "#2EE06E" }}>{correctText}</div>
            </div>
            {submitted && (
              <div style={{ position: "relative", zIndex: 2, font: "600 14px 'Inter'", color: mcVerdict === false ? "#FF3B4E" : "#B9A8D9", marginBottom: 12 }}>
                Your answer: {mySubmittedDisplay || "(no answer submitted)"}
              </div>
            )}
          </>
        )}
        <PowerCards />
      </div>
    );
  }

  if ((phase === "question" || (phase === "pursuit" && pursuitStatus === "question")) && question) {
    const isPicture = question.question_type === "picture";
    const isMultiChoice = question.question_type === "multiple_choice";
    const isSequence = question.question_type === "sequence";
    const isMultiTap = question.question_type === "multi_tap";
    const imageUrl = isPicture ? getMediaUrl(question.option_b) : null;

    const isBlocked = !!blockUntil && blockTeam !== teamName && new Date(blockUntil).getTime() > Date.now();
    if (isBlocked && !submitted) {
      return (
        <div className="qi-player-state qi-player-timeout" style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 12, textAlign: "center" as const, fontFamily: font }}>
          <div style={{ fontSize: 40 }}>TIME-OUT</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}>{blockTeam} played Time-Out</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", marginTop: 8 }}>{blockSecondsLeft}s</div>
        </div>
      );
    }
    // PICTURE ROUND - show image full screen, tap to dismiss
    if (isPicture && imageUrl) {
      return <PictureQuestion
        imageUrl={imageUrl}
        questionText={question.question_text.replace(/^Show teams this image:\s*/i, "")}
        submitted={submitted}
        answerText={answerText}
        setAnswerText={setAnswerText}
        onSubmit={submitAnswer}
        questionIndex={questionIndex}
        timeLeft={timeLeft}
        purple={purple}
        font={font}
        bg={bg}
        teamName={teamName}
        sessionPin={sessionPin}
        roundNumber={roundNumber}
        allowPowerCards={allowPowerCards}
      />;
    }
    const options = [
      { key: "a", text: question.option_a },
      { key: "b", text: question.option_b },
      { key: "c", text: question.option_c },
      { key: "d", text: question.option_d },
    ].filter(o => o.text) as { key: string; text: string }[];
    const seqItems = [question.option_a, question.option_b, question.option_c, question.option_d].filter(Boolean) as string[];
    const multiTapOptions = [
      { key: "a", text: question.option_a },
      { key: "b", text: question.option_b },
      { key: "c", text: question.option_c },
      { key: "d", text: question.option_d },
      { key: "e", text: question.option_e },
      { key: "f", text: question.option_f },
    ].filter(o => o.text) as { key: string; text: string }[];

    return (
      <div className="qi-player-state qi-player-question-screen" style={{ height: "100dvh", background: bg, display: "flex", flexDirection: "column", padding: "14px 16px", fontFamily: font, color: "#fff", boxSizing: "border-box" as const, overflow: "hidden" }}>
        <PlayerStatusBar teamName={teamName} roundName={roundName} powerCardsEnabled={allowPowerCards} />
        {/* Only this inner area scrolls if content is too tall for the screen -
            the page itself never scrolls, and Power Cards (outside this div)
            always stays visible no matter what. */}
        <div className="qi-player-question-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,0.3)" }}>Q{questionIndex + 1}</div>
          {timeLeft !== null && timeLeft > 0 && (
            <div style={{ marginLeft: "auto", width: 32, height: 32, borderRadius: "50%", background: timeLeft <= 3 ? "rgba(239,68,68,0.3)" : "rgba(190,38,193,0.2)", border: "2px solid " + (timeLeft <= 3 ? "#ef4444" : purple), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: timeLeft <= 3 ? "#ef4444" : purple }}>
              {timeLeft}
            </div>
          )}
        </div>

        <div className="qi-player-question-text">{question.question_text.replace(/^Play this track:\s*/i, "").replace(/^Show teams this image:\s*/i, "")}</div>
        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.5)", color: "#ef4444", fontSize: 13, marginBottom: 10, textAlign: "center" as const }}>{error}</div>
        )}

        {isMultiChoice && (
          <div className="fbl" style={{ marginBottom: 10 }}>
            {options.map(opt => {
              const isSelected = selectedAnswer === opt.key;
              const dim = !!selectedAnswer && !isSelected;
              return (
                <div key={opt.key} className={"opt" + (isSelected ? " sel" : "") + (dim ? " dim" : "")}
                  onClick={() => { if (!submitted) setSelectedAnswer(opt.key); }}>
                  <div className="chip">{opt.key.toUpperCase()}</div>{opt.text}
                </div>
              );
            })}
            {!submitted && (
              <>
                <div className={"lockbar" + (selectedAnswer ? "" : " disabled")}
                  onClick={() => { if (!selectedAnswer) return; const opt = options.find(o => o.key === selectedAnswer); setMySubmittedDisplay(opt?.text || selectedAnswer); submitAnswer(selectedAnswer); }}>
                  {selectedAnswer ? "LOCK IT IN" : "SELECT AN ANSWER"}
                </div>
                {selectedAnswer && <div className="lk-note">Speed bonus draining — lock to bank it</div>}
              </>
            )}
            {submitted && <div className="lk-note" style={{ color: "var(--green)", letterSpacing: "0.2em", fontSize: 13 }}>ANSWER LOCKED IN ✓</div>}
          </div>
        )}

        {isMultiTap && (
          <div className="fbl" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {multiTapOptions.map(opt => {
                const isTapped = tappedItems.includes(opt.key);
                return (
                  <button key={opt.key} type="button" className={"qi-player-answer-button" + (isTapped ? " is-selected" : "")}
                    onClick={() => { if (!submitted) setTappedItems(prev => isTapped ? prev.filter(k => k !== opt.key) : [...prev, opt.key]); }}
                    style={{ minHeight: 62, padding: "12px 16px", borderRadius: 14, border: "1px solid", borderColor: isTapped ? "#D94FDC" : "#3A2668", background: isTapped ? "rgba(190,38,193,0.28)" : "#1D1140", boxShadow: isTapped ? "0 0 16px rgba(217,79,220,0.35)" : "none", color: "#fff", font: "700 17px 'Inter'", textAlign: "left" as const, cursor: submitted ? "default" : "pointer", display: "flex", alignItems: "center", gap: 14, opacity: submitted && !isTapped ? 0.35 : 1 }}>
                    <span style={{ width: 32, height: 32, borderRadius: 8, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: isTapped ? "#8A1B8D" : "#0A0118", border: "1px solid " + (isTapped ? "#D94FDC" : "#8A1B8D"), color: isTapped ? "#fff" : "#D94FDC", font: "800 15px 'Inter'" }}>{opt.key.toUpperCase()}</span>
                    <span style={{ flex: 1 }}>{opt.text}</span>
                    {isTapped && <span style={{ fontSize: 16, color: submitted ? "#2EE06E" : "#D94FDC" }}>{submitted ? "✓" : "●"}</span>}
                  </button>
                );
              })}
            </div>
            {!submitted && (
              <div className={"lockbar" + (tappedItems.length > 0 ? "" : " disabled")}
                onClick={() => { if (tappedItems.length === 0) return; const texts = tappedItems.map(k => multiTapOptions.find(o => o.key === k)?.text || k).join(", "); setMySubmittedDisplay(texts); submitAnswer(tappedItems.join(",")); }}>
                {tappedItems.length > 0 ? `LOCK IN ${tappedItems.length} ANSWER${tappedItems.length === 1 ? "" : "S"}` : "TAP YOUR ANSWERS"}
              </div>
            )}
            {submitted && <div className="lk-note" style={{ color: "var(--green)", letterSpacing: "0.2em", fontSize: 13 }}>ANSWERS LOCKED IN ✓</div>}
          </div>
        )}

        {isSequence && (
          <SequenceQuestion options={seqItems} onSubmit={(text) => { setMySubmittedDisplay(text); submitAnswer(text); }} submitted={submitted} />
        )}

        {!isMultiChoice && !isSequence && !submitted && (
          <div style={{ marginBottom: 16 }}>
            <AnswerKeypad mode={question.question_type === "number" ? "number" : "text"} onSubmit={(text) => { setMySubmittedDisplay(text); submitAnswer(text); }} />
          </div>
        )}

        {submitted && (
          <PlayerResultBanner tone="locked" title="LOCKED IN ✓">{mySubmittedDisplay || "Waiting for the reveal"}</PlayerResultBanner>
        )}
        </div>
        <PowerCards />
      </div>
    );
  }

  // FINALE — podium / final-standings reveal. The handset must follow the same
  // current-session finale phase as the Display instead of dropping back to the
  // lobby "You are In!" confirmation. It shows an "Eyes Up" watch-the-screen
  // state during the live reveal, then this team's own final position once the
  // podium (trophy) is shown.
  if (phase === "quiz_end") {
    const sortedFinal = [...phoneScoreboardData].sort((a, b) => b.total_points - a.total_points);
    const myIndex = sortedFinal.findIndex(s => s.team_name === teamName);
    const myRank = myIndex >= 0 ? myIndex + 1 : null;
    const myScore = myIndex >= 0 ? sortedFinal[myIndex].total_points : null;
    const revealComplete = quizEndTrophyVisible || (sortedFinal.length > 0 && quizEndRevealedCount >= sortedFinal.length);
    const myRankRevealed = myRank !== null && (quizEndTrophyVisible || (sortedFinal.length - quizEndRevealedCount) < myRank);
    const ordinal = (n: number) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
    return (
      <div className="fbl fbl-phone qi-player-state qi-player-finale" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 14, textAlign: "center" as const }}>
        <div style={{ position: "relative", zIndex: 2, font: "700 13px 'Inter'", letterSpacing: 4, color: "#B9A8D9" }}>{revealComplete ? "FINAL RESULTS" : "FINAL STANDINGS"}</div>
        {!myRankRevealed ? (
          <>
            <Crest initials={teamInitials(teamName)} size={72} dim />
            <div style={{ position: "relative", zIndex: 2, font: "800 26px 'Inter'", color: purple, letterSpacing: 2 }}>EYES UP</div>
            <div style={{ position: "relative", zIndex: 2, font: "600 15px 'Inter'", color: "#B9A8D9" }}>Watch the big screen for the results…</div>
          </>
        ) : (
          <>
            <Crest initials={teamInitials(teamName)} size={myRank === 1 ? 104 : 84} gold={!!myRank && myRank <= 3} />
            {/* Rank is the single thing the player wants — make it the hero. */}
            <div style={{ position: "relative", zIndex: 2, font: "900 clamp(46px,17vw,80px) 'Inter'", color: myRank && myRank <= 3 ? "#E8C36A" : "#fff", lineHeight: 1, textShadow: myRank && myRank <= 3 ? "0 0 30px rgba(232,195,106,.5)" : "none" }}>{myRank ? ordinal(myRank) : "—"}</div>
            <div style={{ position: "relative", zIndex: 2, font: "800 24px 'Inter'", color: "#fff", letterSpacing: 1 }}>{teamName}</div>
            {myScore !== null && (
              <div style={{ position: "relative", zIndex: 2, padding: "14px 34px", borderRadius: 16, background: "rgba(190,38,193,0.15)", border: "2px solid rgba(190,38,193,0.45)", marginTop: 4 }}>
                <div style={{ font: "700 11px 'Inter'", letterSpacing: 3, color: "#B9A8D9", marginBottom: 4 }}>FINAL SCORE</div>
                <div style={{ font: "900 46px 'Inter'", color: "#D94FDC", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{myScore}</div>
              </div>
            )}
            <div style={{ position: "relative", zIndex: 2, font: "400 13px 'Inter'", color: "#6B5A8E", marginTop: 8 }}>Full results on the big screen</div>
          </>
        )}
      </div>
    );
  }

  // WAITING (lobby) — approved Fable handset "WAITING" state: crest birth,
  // team name, waiting line + room count. Power-card selector preserved below.
  return (
    <div className="fbl fbl-phone qi-player-state qi-player-waiting" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PlayerStatusBar teamName={teamName} roundName={roundName} powerCardsEnabled={allowPowerCards} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: 24, textAlign: "center", position: "relative", zIndex: 2 }}>
        <Crest initials={teamInitials(teamName)} size={120} />
        <div style={{ font: "800 clamp(22px,6.6vw,30px) 'Inter'", color: "#fff" }}>{teamName}</div>
        <div style={{ font: "600 clamp(15px,4.6vw,18px) 'Inter'", color: "#B9A8D9", lineHeight: 1.45 }}>
          Waiting for your host…
          {allTeamNames.length > 0 && (
            <>
              <br />
              {allTeamNames.length} team{allTeamNames.length === 1 ? "" : "s"} in the room tonight
            </>
          )}
        </div>
      </div>
      {allowPowerCards ? <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} roundNumber={roundNumber} enabled={allowPowerCards} /> : <div className="qi-player-cards-paused">Power Cards unavailable this round</div>}
    </div>
  );
}
