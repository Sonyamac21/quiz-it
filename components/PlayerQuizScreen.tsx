'use client';
import React, { useEffect, useState, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMediaUrl } from "@/lib/getMediaUrl";
import { UnoPlayerCards } from "@/components/UnoCards";
import { AnswerKeypad } from "@/components/AnswerKeypad";
import { SlotReels } from "@/components/SlotReels";
import { SpinWheel, buildTeamSegments } from "@/components/SpinWheel";

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

type Phase = "waiting" | "question" | "answer" | "celebration" | "hard_deck" | "intermission" | "spin_to_win" | "quiz_end";

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
              display: "flex", alignItems: "center", gap: 10, padding: "16px 16px", borderRadius: 12,
              background: isPicked ? "rgba(190,38,193,0.18)" : "rgba(255,255,255,0.07)",
              border: "1.5px solid " + (isPicked ? purple : "rgba(190,38,193,0.25)"),
              textAlign: "left" as const, cursor: isPicked ? "default" : "pointer", width: "100%",
            }}>
            <span style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
              background: isPicked ? purple : "rgba(255,255,255,0.08)",
              color: isPicked ? "#fff" : "rgba(255,255,255,0.3)",
              fontWeight: 800, fontSize: 13,
            }}>
              {isPicked ? pickedIndex + 1 : ""}
            </span>
            <span style={{ flex: 1, color: "#fff", fontSize: 14, fontFamily: font }}>{item}</span>
          </button>
        );
      })}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button type="button" onClick={resetPicks} disabled={picked.length === 0}
          style={{ flex: 1, padding: "12px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: picked.length ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 13, fontFamily: font, cursor: picked.length ? "pointer" : "default" }}>
          RESET
        </button>
        <button type="button" onClick={submitOrder} disabled={!allPicked}
          style={{ flex: 2, padding: "12px", borderRadius: 10, background: allPicked ? purple : "#1a1a2e", color: allPicked ? "#fff" : "rgba(255,255,255,0.3)", border: "none", fontSize: 15, fontFamily: font, letterSpacing: 2, cursor: allPicked ? "pointer" : "default" }}>
          SUBMIT ORDER
        </button>
      </div>
    </div>
  );
}

function PictureQuestion({ imageUrl, questionText, submitted, answerText, setAnswerText, onSubmit, questionIndex, timeLeft, purple, font, bg, teamName, sessionPin, roundNumber }: {
  imageUrl: string; questionText: string; submitted: boolean; answerText: string;
  setAnswerText: (v: string) => void; onSubmit: (a: string) => void;
  questionIndex: number; timeLeft: number | null; purple: string; font: string; bg: string;
  teamName: string; sessionPin: string; roundNumber: number;
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
          <div style={{ width:"80%", maxWidth:340, padding:"40px 24px", borderRadius:16, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.15)", textAlign:"center" as const }}>
            <div style={{ fontSize:36, marginBottom:12 }}>🖼️</div>
            <div style={{ fontSize:14, color:"rgba(255,255,255,0.6)", fontFamily:font }}>Image could not be loaded</div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.35)", marginTop:6, fontFamily:font }}>Listen for the host to read the question</div>
          </div>
        )}
        <div style={{ marginTop:20, fontSize:13, color:"rgba(255,255,255,0.4)", letterSpacing:2, fontFamily:font }}>TAP TO ANSWER</div>
        {timeLeft !== null && timeLeft > 0 && (
          <div style={{ position:"absolute", top:20, right:20, width:44, height:44, borderRadius:"50%", background:timeLeft<=3?"rgba(239,68,68,0.3)":"rgba(190,38,193,0.2)", border:"2px solid "+(timeLeft<=3?"#ef4444":purple), display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:800, color:timeLeft<=3?"#ef4444":purple, fontFamily:font }}>
            {timeLeft}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100vh", background:bg, display:"flex", flexDirection:"column", padding:20, fontFamily:font, color:"#fff" }}>
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
      <div style={{ marginTop:"auto", paddingTop:12 }}>
        <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} roundNumber={roundNumber} />
      </div>
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
  const [phoneScoreboardData, setPhoneScoreboardData] = useState<{team_name:string; total_points:number}[]>([]);
  const [spinTargetIdx, setSpinTargetIdx] = useState<number | null>(null);
  const [spinNonce, setSpinNonce] = useState<number | null>(null);
  const [hardDeckTeam, setHardDeckTeam] = useState<string | null>(null);
  const [hardDeckStatus, setHardDeckStatus] = useState<string>("idle");
  const [roundNumber, setRoundNumber] = useState<number>(1);
  const [hardDeckGuess, setHardDeckGuess] = useState<string | null>(null);
  const [stickGamblePressed, setStickGamblePressed] = useState<string | null>(null);
  const [spinOffered, setSpinOffered] = useState(false);
  const [spinChoice, setSpinChoice] = useState<string|null>(null);
  const [hardDeckPotential, setHardDeckPotential] = useState(0);
  const [hardDeckCards, setHardDeckCards] = useState<{rank:number; suit:string}[]>([]);
  const [hardDeckWheelTarget, setHardDeckWheelTarget] = useState<number | null>(null);
  const [hardDeckWheelSpinning, setHardDeckWheelSpinning] = useState(false);
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


  const bg = "#080810";
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
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    async function requestWakeLock() {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await (navigator as Navigator & { wakeLock: { request: (type: string) => Promise<WakeLockSentinel> } }).wakeLock.request("screen");
        }
      } catch {}
    }
    requestWakeLock();
    document.addEventListener("visibilitychange", requestWakeLock);
    return () => {
      document.removeEventListener("visibilitychange", requestWakeLock);
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, []);
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
        .select("phase, status, current_question, current_question_index, timer_started_at, timer_duration, fastest_team, fastest_song, fastest_points, hard_deck_team, hard_deck_status, hard_deck_potential, hard_deck_cards, hard_deck_wheel_target, hard_deck_wheel_spinning, hard_deck_guess, spin_offered, spin_choice, spin_target_idx, spin_nonce, intermission_offers, intermission_whatsapp, intermission_other_quizzes, block_until, block_team, show_scoreboard, scoreboard_data, quiz_end_revealed_count, quiz_end_trophy_visible")
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

    // Mobile browsers throttle or fully pause setInterval (and can drop the
    // realtime websocket) while the phone screen is locked or the tab is
    // backgrounded - a player who steps away mid-question can come back to
    // stale state with no question visible until the next natural event. Force
    // an immediate resync the instant the tab/page becomes visible or focused
    // again, instead of waiting on a timer that may not have been running.
    const onVisible = () => { if (document.visibilityState === "visible") fetchSession(); };
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
    setShowScoreboardOnPhone(!!data.show_scoreboard);
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
    setSpinOffered(!!data.spin_offered);
    setSpinChoice((data.spin_choice as string) || null);
    setIntermissionOffers((data.intermission_offers as string) || "");
    setIntermissionWhatsapp((data.intermission_whatsapp as string) || "");
    setIntermissionOtherQuizzes((data.intermission_other_quizzes as string) || "");
    setQuizEndRevealedCount((data.quiz_end_revealed_count as number) || 0);
    setQuizEndTrophyVisible(!!data.quiz_end_trophy_visible);

    // Reset answer state when phase changes to question, question index changes, OR the question content itself changes (e.g. host used Dump Question to swap content without changing the index)
    const newQText = newQ?.question_text || "";
    if (newPhase === "question" && (newIdx !== lastQIndexRef.current || lastPhaseRef.current !== "question" || newQText !== lastQTextRef.current)) {
      lastQIndexRef.current = newIdx;
      lastQTextRef.current = newQText;
      setQuestionIndex(newIdx);
      setSelectedAnswer("");
      setAnswerText("");
      setSubmitted(false);
      setTappedItems([]);
      setMySubmittedDisplay("");
    }
    lastPhaseRef.current = newPhase;

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
    // Optimistically show locked-in, but verify the write actually succeeded -
    // on flaky venue wifi the insert can silently fail while the UI still says "locked in".
    setSubmitted(true);
    const supabase = createSupabaseBrowserClient();
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
    <div style={{ flexShrink: 0, paddingTop: 10, paddingBottom: 4, borderTop: "1px solid rgba(255,255,255,0.06)", background: bg }}>
      <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} roundNumber={roundNumber} compact={true} />
    </div>
  );

  if (showScoreboardOnPhone) {
    const sorted = [...phoneScoreboardData].sort((a,b) => b.total_points - a.total_points);
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", padding: 24, fontFamily: font, color: "#fff" }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: purple, letterSpacing: 3, textAlign: "center" as const, marginBottom: 20 }}>LEADERBOARD</div>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
          {sorted.map((s, i) => (
            <div key={s.team_name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, background: s.team_name === teamName ? "rgba(190,38,193,0.2)" : "rgba(255,255,255,0.05)", border: s.team_name === teamName ? "1.5px solid " + purple : "1px solid rgba(255,255,255,0.1)", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }}>
              <span style={{ fontWeight: 800, color: i === 0 ? "#facc15" : i === 1 ? "#c7cbd1" : i === 2 ? "#c97d3e" : "rgba(255,255,255,0.4)", minWidth: 24 }}>{i+1}.</span>
              <span style={{ flex: 1, fontWeight: 700 }}>{s.team_name}</span>
              <span style={{ fontWeight: 900, color: purple, fontSize: 18 }}>{s.total_points}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (phase === "spin_to_win") {
    const isWinner = fastestTeamName === teamName;
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, gap: 12, textAlign: "center" as const }}>
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
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 16, textAlign: "center" as const, fontFamily: font, color: "#fff" }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 2 }}>QUIZ HAS ENDED</div>
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.6)" }}>Thanks for playing!</div>
      </div>
    );
  }
  if (phase === "hard_deck") {
    const isSelected = hardDeckTeam === teamName;
    const rankLabels: Record<number,string> = { 1:"A", 11:"J", 12:"Q", 13:"K" };
    const rankLabel = (r: number) => rankLabels[r] || String(r);
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 16, textAlign: "center" as const }}>
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
          <div style={{ fontSize: isSelected ? 28 : 20, color: isSelected ? "#facc15" : "#fff", fontWeight: 800, letterSpacing: 1 }}>
            {isSelected ? "🎯 IT'S YOU!" : hardDeckTeam}
          </div>
        )}

        {hardDeckCards.length > 0 && (
          <div style={{ padding: "16px 20px", borderRadius: 18, background: "linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))", border: "1px solid rgba(190,38,193,0.25)", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05), inset 0 -1px 16px rgba(0,0,0,0.4), 0 0 24px rgba(190,38,193,0.15)" }}>
            <div style={{ display: "flex", gap: 12 }}>
              {hardDeckCards.map((c, i) => (
                <div key={i} style={{ width: 90, height: 128, borderRadius: 12, background: "linear-gradient(160deg, #ffffff 0%, #f2f2f5 100%)", border: "1px solid rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 900, color: (c.suit === "♥" || c.suit === "♦") ? "#dc2626" : "#111", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -8px 12px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(212,175,90,0.3)" }}>
                  <div>{rankLabel(c.rank)}</div>
                  <div style={{ fontSize: 36 }}>{c.suit}</div>
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
          <div style={{ display: "flex", gap: 16 }}>
            <button
              onClick={() => submitHardDeckGuess("higher")}
              disabled={!!hardDeckGuess}
              style={{
                padding: "26px 40px", borderRadius: 14,
                background: hardDeckGuess === "higher" ? "#22c55e" : "rgba(34,197,94,0.25)",
                border: hardDeckGuess === "higher" ? "3px solid #fff" : "2px solid #22c55e",
                color: "#fff", fontSize: 24, fontWeight: 800, cursor: hardDeckGuess ? "default" : "pointer",
                boxShadow: hardDeckGuess === "higher" ? "0 4px 12px rgba(34,197,94,0.3)" : "none",
                transform: hardDeckGuess === "higher" ? "scale(1.05)" : "scale(1)",
                opacity: hardDeckGuess && hardDeckGuess !== "higher" ? 0.4 : 1,
                transition: "all 0.15s ease",
              }}
            >HIGHER</button>
            <button
              onClick={() => submitHardDeckGuess("lower")}
              disabled={!!hardDeckGuess}
              style={{
                padding: "26px 40px", borderRadius: 14,
                background: hardDeckGuess === "lower" ? "#ef4444" : "rgba(239,68,68,0.25)",
                border: hardDeckGuess === "lower" ? "3px solid #fff" : "2px solid #ef4444",
                color: "#fff", fontSize: 24, fontWeight: 800, cursor: hardDeckGuess ? "default" : "pointer",
                boxShadow: hardDeckGuess === "lower" ? "0 4px 12px rgba(239,68,68,0.3)" : "none",
                transform: hardDeckGuess === "lower" ? "scale(1.05)" : "scale(1)",
                opacity: hardDeckGuess && hardDeckGuess !== "lower" ? 0.4 : 1,
                transition: "all 0.15s ease",
              }}
            >LOWER</button>
          </div>
        )}
        {isSelected && hardDeckStatus === "decision" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#facc15" }}>You have {hardDeckPotential} points!</div>
            <div style={{ display: "flex", gap: 16 }}>
              <button
                onClick={() => { setStickGamblePressed("stick"); submitHardDeckStick(); }}
                disabled={!!stickGamblePressed}
                style={{
                  padding: "18px 28px", borderRadius: 12,
                  background: stickGamblePressed === "stick" ? "#22c55e" : "rgba(34,197,94,0.25)",
                  border: stickGamblePressed === "stick" ? "3px solid #fff" : "2px solid #22c55e",
                  color: "#fff", fontSize: 16, fontWeight: 700, cursor: stickGamblePressed ? "default" : "pointer",
                  boxShadow: stickGamblePressed === "stick" ? "0 4px 12px rgba(34,197,94,0.3)" : "none",
                  transform: stickGamblePressed === "stick" ? "scale(1.05)" : "scale(1)",
                  opacity: stickGamblePressed && stickGamblePressed !== "stick" ? 0.4 : 1,
                  transition: "all 0.15s ease",
                }}
              >STICK</button>
              <button
                onClick={() => { setStickGamblePressed("gamble"); submitHardDeckGamble(); }}
                disabled={!!stickGamblePressed}
                style={{
                  padding: "18px 28px", borderRadius: 12,
                  background: stickGamblePressed === "gamble" ? purple : "rgba(190,38,193,0.25)",
                  border: stickGamblePressed === "gamble" ? "3px solid #fff" : "2px solid " + purple,
                  color: "#fff", fontSize: 16, fontWeight: 700, cursor: stickGamblePressed ? "default" : "pointer",
                  boxShadow: stickGamblePressed === "gamble" ? "0 4px 12px rgba(190,38,193,0.3)" : "none",
                  transform: stickGamblePressed === "gamble" ? "scale(1.05)" : "scale(1)",
                  opacity: stickGamblePressed && stickGamblePressed !== "gamble" ? 0.4 : 1,
                  transition: "all 0.15s ease",
                }}
              >GAMBLE</button>
            </div>
          </>
        )}
        {hardDeckStatus === "won" && (
          <div style={{ fontSize: 22, color: "#22c55e", fontWeight: 800, letterSpacing: 0.5 }}>{isSelected ? "You won" : hardDeckTeam + " won"} {hardDeckPotential} points! 🎉</div>
        )}
        {hardDeckStatus === "lost" && (
          <div style={{ fontSize: 22, color: "#ef4444", fontWeight: 800, letterSpacing: 0.5 }}>{isSelected ? "Bust — better luck next time!" : hardDeckTeam + " busted!"}</div>
        )}
      </div>
    );
  }

  if (phase === "intermission") {
    const hasContent = intermissionOffers || intermissionWhatsapp || intermissionOtherQuizzes;
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 16, textAlign: "center" as const, fontFamily: font }}>
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
        <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 24, textAlign: "center" as const, fontFamily: font }}>
          <div style={{ fontSize: 22, color: "#facc15", fontWeight: 900, letterSpacing: 2, fontFamily: "'Bruno Ace SC', sans-serif" }}>SPIN TO WIN?</div>
          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.5)", color: "#ef4444", fontSize: 13, textAlign: "center" as const }}>{error}</div>
          )}
          <button onClick={chooseSpin} style={{ width: "100%", maxWidth: 320, padding: "32px 0", borderRadius: 20, background: "rgba(34,197,94,0.25)", border: "3px solid #22c55e", color: "#fff", fontSize: 32, fontWeight: 900, letterSpacing: 4, cursor: "pointer" }}>SPIN</button>
          <button onClick={choosePass} style={{ width: "100%", maxWidth: 320, padding: "24px 0", borderRadius: 20, background: "rgba(255,255,255,0.08)", border: "2px solid rgba(255,255,255,0.3)", color: "#fff", fontSize: 22, fontWeight: 700, letterSpacing: 3, cursor: "pointer" }}>PASS</button>
        </div>
      );
    }
    const isWinner = fastestTeamName === teamName;
    const confettiColors = ["#BE26C1","#fbbf24","#22c55e","#38bdf8","#f87171","#a78bfa"];
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: font, position: "relative", overflow: "hidden" }}>
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
                <div style={{ fontSize: 16, color: "#facc15", fontWeight: 700, marginBottom: 12, fontFamily: "'Bruno Ace SC', sans-serif" }}>Spin to Win?</div>
                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                  <button onClick={chooseSpin} style={{ padding: "14px 28px", borderRadius: 12, background: "rgba(34,197,94,0.25)", border: "2px solid #22c55e", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>SPIN</button>
                  <button onClick={choosePass} style={{ padding: "14px 28px", borderRadius: 12, background: "rgba(255,255,255,0.08)", border: "2px solid rgba(255,255,255,0.3)", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>PASS</button>
                </div>
              </div>
            )}
            {isWinner && spinChoice === "spin" && (
              <div style={{ fontSize: 16, color: "#22c55e", fontWeight: 700, marginBottom: 20, textAlign: "center" as const }}>Spinning... watch the big screen!</div>
            )}
            {isWinner && spinChoice === "pass" && (
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 20, textAlign: "center" as const }}>You passed on the spin</div>
            )}
          <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", letterSpacing: 3, textAlign: "center", lineHeight: 1.2, marginBottom: 20, animation: "flash 0.8s ease-in-out infinite", textShadow: "0 0 20px rgba(255,255,255,0.6)" }}>FASTEST<br/>CORRECT ANSWER</div>
          </>
        )}
        {isWinner ? (
          <>
            <div style={{ fontSize: 80, marginBottom: 8 }}>{"🏆"}</div>
            <div style={{ fontSize: 42, fontWeight: 900, color: purple, letterSpacing: 2, textAlign: "center", textShadow: "0 0 40px rgba(190,38,193,0.8)", marginBottom: 8 }}>{fastestTeamName}</div>
            <div style={{ fontSize: 18, color: "#22c55e", fontWeight: 800, letterSpacing: 2, marginBottom: 24 }}>{"That's you!"}</div>
            <div style={{ padding: "20px 40px", borderRadius: 20, background: "rgba(34,197,94,0.15)", border: "2px solid rgba(34,197,94,0.5)", marginBottom: 32, textAlign: "center" }}>
              <div style={{ fontSize: 11, letterSpacing: 3, color: "rgba(34,197,94,0.7)", marginBottom: 4 }}>POINTS AWARDED</div>
              <div style={{ fontSize: 56, fontWeight: 900, color: "#22c55e", textShadow: "0 0 20px rgba(34,197,94,0.6)", lineHeight: 1 }}>{fastestPoints >= 0 ? "+" : ""}{fastestPoints}</div>
            </div>
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
        <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} roundNumber={roundNumber} compact={true} />
      </div>
    );
  }

  if (phase === "answer" && question) {
    const correctText = getCorrectAnswerText(question);
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", padding: 20, fontFamily: font, color: "#fff" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,0.3)", marginBottom: 12 }}>ANSWER REVEALED</div>
        <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.4, marginBottom: 16, color: "rgba(255,255,255,0.8)" }}>{question.question_text.replace(/^Play this track:\s*/i, "").replace(/^Show teams this image:\s*/i, "")}</div>
        <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.5)", marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "rgba(34,197,94,0.7)", letterSpacing: 3, marginBottom: 4 }}>CORRECT ANSWER</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#22c55e" }}>{correctText}</div>
        </div>
        {submitted && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
            Your answer: {mySubmittedDisplay || "(no answer submitted)"}
          </div>
        )}
        <PowerCards />
      </div>
    );
  }

  if ((phase === "question") && question) {
    const isPicture = question.question_type === "picture";
    const isMultiChoice = question.question_type === "multiple_choice";
    const isSequence = question.question_type === "sequence";
    const isMultiTap = question.question_type === "multi_tap";
    const imageUrl = isPicture ? getMediaUrl(question.option_b) : null;

    const isBlocked = !!blockUntil && blockTeam !== teamName && new Date(blockUntil).getTime() > Date.now();
    if (isBlocked && !submitted) {
      return (
        <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 12, textAlign: "center" as const, fontFamily: font }}>
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
      <div style={{ height: "100dvh", background: bg, display: "flex", flexDirection: "column", padding: "14px 16px", fontFamily: font, color: "#fff", boxSizing: "border-box" as const, overflow: "hidden" }}>
        {/* Only this inner area scrolls if content is too tall for the screen -
            the page itself never scrolls, and Power Cards (outside this div)
            always stays visible no matter what. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,0.3)" }}>Q{questionIndex + 1}</div>
          {timeLeft !== null && timeLeft > 0 && (
            <div style={{ marginLeft: "auto", width: 32, height: 32, borderRadius: "50%", background: timeLeft <= 3 ? "rgba(239,68,68,0.3)" : "rgba(190,38,193,0.2)", border: "2px solid " + (timeLeft <= 3 ? "#ef4444" : purple), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: timeLeft <= 3 ? "#ef4444" : purple }}>
              {timeLeft}
            </div>
          )}
        </div>

        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, marginBottom: 12, color: "#fff" }}>{question.question_text.replace(/^Play this track:\s*/i, "").replace(/^Show teams this image:\s*/i, "")}</div>
        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.5)", color: "#ef4444", fontSize: 13, marginBottom: 10, textAlign: "center" as const }}>{error}</div>
        )}

        {isMultiChoice && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {options.map(opt => {
              const isSelected = selectedAnswer === opt.key;
              return (
                <button key={opt.key} type="button"
                  onClick={() => { if (!submitted) setSelectedAnswer(opt.key); }}
                style={{ padding: "16px 16px", borderRadius: 12, border: "1.5px solid", borderColor: isSelected ? purple : "rgba(255,255,255,0.15)", background: isSelected ? "rgba(190,38,193,0.25)" : "rgba(255,255,255,0.06)", color: "#fff", fontSize: 16, fontFamily: font, textAlign: "left" as const, cursor: submitted ? "default" : "pointer", display: "flex", alignItems: "center", gap: 10, opacity: submitted && !isSelected ? 0.35 : 1 }}>
                  <span style={{ color: isSelected ? "#fff" : purple, fontWeight: 700, minWidth: 16 }}>{opt.key.toUpperCase()}.</span>
                  {opt.text}
                  {isSelected && !submitted && <span style={{ marginLeft: "auto", fontSize: 13, color: purple }}>●</span>}
                  {isSelected && submitted && <span style={{ marginLeft: "auto", fontSize: 13, color: "#22c55e" }}>✓</span>}
                </button>
              );
            })}
            {!submitted && selectedAnswer && (
              <button type="button" onClick={() => { const opt = options.find(o => o.key === selectedAnswer); setMySubmittedDisplay(opt?.text || selectedAnswer); submitAnswer(selectedAnswer); }}
                style={{ padding: "10px", borderRadius: 10, background: purple, color: "#fff", border: "none", fontSize: 13, fontFamily: font, letterSpacing: 2, cursor: "pointer", marginTop: 2 }}>
                LOCK IN ANSWER
              </button>
            )}
            {submitted && <div style={{ fontSize: 11, color: "#22c55e", textAlign: "center" as const, marginTop: 2, letterSpacing: 2 }}>ANSWER LOCKED IN ✓</div>}
          </div>
        )}

        {isMultiTap && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {multiTapOptions.map(opt => {
                const isTapped = tappedItems.includes(opt.key);
                return (
                  <button key={opt.key} type="button"
                    onClick={() => { if (!submitted) setTappedItems(prev => isTapped ? prev.filter(k => k !== opt.key) : [...prev, opt.key]); }}
                    style={{ padding: "16px 16px", borderRadius: 12, border: "1.5px solid", borderColor: isTapped ? purple : "rgba(255,255,255,0.15)", background: isTapped ? "rgba(190,38,193,0.25)" : "rgba(255,255,255,0.06)", color: "#fff", fontSize: 16, fontFamily: font, textAlign: "left" as const, cursor: submitted ? "default" : "pointer", display: "flex", alignItems: "center", gap: 10, opacity: submitted && !isTapped ? 0.35 : 1 }}>
                    <span style={{ color: isTapped ? "#fff" : purple, fontWeight: 700, minWidth: 16 }}>{opt.key.toUpperCase()}.</span>
                    {opt.text}
                    {isTapped && !submitted && <span style={{ marginLeft: "auto", fontSize: 13, color: purple }}>●</span>}
                    {isTapped && submitted && <span style={{ marginLeft: "auto", fontSize: 13, color: "#22c55e" }}>✓</span>}
                  </button>
                );
              })}
            </div>
            {!submitted && tappedItems.length > 0 && (
              <button type="button" onClick={() => { const texts = tappedItems.map(k => multiTapOptions.find(o => o.key === k)?.text || k).join(", "); setMySubmittedDisplay(texts); submitAnswer(tappedItems.join(",")); }}
                style={{ padding: "10px", borderRadius: 10, background: purple, color: "#fff", border: "none", fontSize: 13, fontFamily: font, letterSpacing: 2, cursor: "pointer", marginTop: 2, width: "100%" }}>
                LOCK IN ANSWERS
              </button>
            )}
            {submitted && <div style={{ fontSize: 11, color: "#22c55e", textAlign: "center" as const, marginTop: 2, letterSpacing: 2 }}>ANSWERS LOCKED IN ✓</div>}
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
          <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(190,38,193,0.15)", border: "1px solid rgba(190,38,193,0.4)", textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 15, color: purple, fontWeight: 700 }}>Answer Submitted!</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Waiting for host...</div>
          </div>
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
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 16, textAlign: "center" as const, fontFamily: font, color: "#fff" }}>
        <div style={{ fontSize: 13, letterSpacing: 4, color: "rgba(255,255,255,0.4)" }}>{revealComplete ? "FINAL RESULTS" : "FINAL STANDINGS"}</div>
        {!myRankRevealed ? (
          <>
            <div style={{ fontSize: 40 }}>{"\u{1F440}"}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: purple, letterSpacing: 2 }}>EYES UP!</div>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,0.55)" }}>Watch the big screen for the results…</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: myRank === 1 ? 64 : 40, marginBottom: 4 }}>{myRank === 1 ? "\u{1F3C6}" : myRank === 2 ? "\u{1F948}" : myRank === 3 ? "\u{1F949}" : "\u{2B50}"}</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: "#fff", letterSpacing: 1 }}>{teamName}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: myRank && myRank <= 3 ? "#facc15" : purple, letterSpacing: 1 }}>{myRank ? ordinal(myRank) + " place" : "Thanks for playing!"}</div>
            {myScore !== null && (
              <div style={{ padding: "14px 28px", borderRadius: 16, background: "rgba(190,38,193,0.15)", border: "2px solid rgba(190,38,193,0.45)", marginTop: 4 }}>
                <div style={{ fontSize: 10, letterSpacing: 3, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>FINAL SCORE</div>
                <div style={{ fontSize: 40, fontWeight: 900, color: purple, lineHeight: 1 }}>{myScore}</div>
              </div>
            )}
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 8 }}>Full results on the big screen</div>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: font }}>
      <div style={{ fontSize: 38, fontWeight: 800, color: purple, letterSpacing: 2, textAlign: "center", textShadow: "0 0 30px rgba(190,38,193,0.5)", marginBottom: 8 }}>You are In!</div>
      <div style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", marginBottom: 32 }}>{teamName} — good luck!</div>
      <div style={{ padding: "14px 20px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", textAlign: "center", marginBottom: 32, boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>STATUS</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Waiting for the quiz to start...</div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 10 }}>
          {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: purple, opacity: 0.6 }} />)}
        </div>
      </div>
      <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} roundNumber={roundNumber} />
    </div>
  );
}
