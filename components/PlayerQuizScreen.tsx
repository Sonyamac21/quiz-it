'use client';
import React, { useEffect, useState, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { UnoPlayerCards } from "@/components/UnoCards";
import { AnswerKeypad } from "@/components/AnswerKeypad";
import { SlotReels } from "@/components/SlotReels";

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

type Phase = "waiting" | "question" | "answer" | "celebration" | "hard_deck" | "intermission" | "spin_to_win";

interface Props {
  teamName: string;
  sessionPin: string;
}

function SequenceQuestion({ options, onSubmit, submitted }: { options: string[]; onSubmit: (ans: string) => void; submitted: boolean }) {
  const [picked, setPicked] = useState<number[]>([]);
  const purple = "#BE26C1";
  const font = "'Bruno Ace SC', sans-serif";
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

function PictureQuestion({ imageUrl, questionText, submitted, answerText, setAnswerText, onSubmit, questionIndex, timeLeft, purple, font, bg, teamName, sessionPin }: {
  imageUrl: string; questionText: string; submitted: boolean; answerText: string;
  setAnswerText: (v: string) => void; onSubmit: (a: string) => void;
  questionIndex: number; timeLeft: number | null; purple: string; font: string; bg: string;
  teamName: string; sessionPin: string;
}) {
  const [imageDismissed, setImageDismissed] = React.useState(false);

  if (!imageDismissed) {
    return (
      <div onClick={() => setImageDismissed(true)}
        style={{ minHeight:"100vh", background:bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:"pointer", position:"relative", padding:16 }}>
        <img src={imageUrl} alt="Quiz" style={{ maxWidth:"100%", maxHeight:"75vh", borderRadius:16, objectFit:"contain", boxShadow:"0 0 40px rgba(190,38,193,0.3)" }} />
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
      <img src={imageUrl} alt="Quiz" style={{ width:"100%", maxHeight:"35vh", objectFit:"contain", borderRadius:12, marginBottom:16 }} />
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
        <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} />
      </div>
    </div>
  );
}

export function PlayerQuizScreen({ teamName, sessionPin }: Props) {
  const [phase, setPhase] = useState<Phase>("waiting");
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [tappedItems, setTappedItems] = useState<string[]>([]);
  const [mySubmittedDisplay, setMySubmittedDisplay] = useState("");
  const [blockUntil, setBlockUntil] = useState<string | null>(null);
  const [blockTeam, setBlockTeam] = useState<string | null>(null);
  const [blockSecondsLeft, setBlockSecondsLeft] = useState(0);
  const [cardFlash, setCardFlash] = useState<{ team: string; type: string } | null>(null);
  const cardFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardFlashElRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;display:none;padding:10px 20px;border-radius:10px;background:rgba(20,5,40,0.95);border:2px solid #BE26C1;color:#fff;font-family:sans-serif;font-size:13px;font-weight:700;letter-spacing:0.5px;box-shadow:0 4px 16px rgba(190,38,193,0.5);max-width:90vw;text-align:center;";
    document.body.appendChild(el);
    cardFlashElRef.current = el;
    return () => { if (el.parentNode) el.parentNode.removeChild(el); };
  }, []);
  useEffect(() => {
    const el = cardFlashElRef.current;
    if (!el) return;
    if (cardFlash) {
      const label = cardFlash.type === "block" ? "Time-Out" : cardFlash.type === "reverse" ? "Reverse" : "Boost";
      el.textContent = cardFlash.team + " played " + label + "!";
      el.style.display = "block";
    } else {
      el.style.display = "none";
    }
  }, [cardFlash]);
  const [answerText, setAnswerText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [fastestTeamName, setFastestTeamName] = useState<string | null>(null);
  const [fastestSongName, setFastestSongName] = useState<string | null>(null);
  const [spinTargetIdx, setSpinTargetIdx] = useState<number | null>(null);
  const [hardDeckTeam, setHardDeckTeam] = useState<string | null>(null);
  const [hardDeckStatus, setHardDeckStatus] = useState<string>("idle");
  const [spinOffered, setSpinOffered] = useState(false);
  const [spinChoice, setSpinChoice] = useState<string|null>(null);
  const [hardDeckPotential, setHardDeckPotential] = useState(0);
  const [intermissionOffers, setIntermissionOffers] = useState("");
  const [intermissionWhatsapp, setIntermissionWhatsapp] = useState("");
  const [intermissionOtherQuizzes, setIntermissionOtherQuizzes] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastQIndexRef = useRef(-1);
  const lastPhaseRef = useRef<string>("");


  const bg = "#080810";
  const purple = "#BE26C1";
  const font = "'Bruno Ace SC', sans-serif";

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

  const applySessionDataRef = useRef<(data: Record<string, unknown>) => void>(() => {});

  useEffect(() => {
    applySessionDataRef.current = applySessionData;
  });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function fetchSession() {
      const { data } = await supabase
        .from("sessions")
        .select("phase, current_question, current_question_index, timer_started_at, timer_duration, fastest_team, fastest_song, hard_deck_team, hard_deck_status, hard_deck_potential, spin_offered, spin_choice, spin_target_idx, intermission_offers, intermission_whatsapp, intermission_other_quizzes, block_until, block_team")
        .eq("pin", sessionPin)
        .single();
      if (data) applySessionDataRef.current(data as Record<string, unknown>);
    }

    fetchSession();

    // Polling every 500ms to keep handset in sync
    const pollInterval = setInterval(fetchSession, 500);

    const channel = supabase
      .channel("player-session-" + sessionPin)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "sessions",
      }, (payload) => {
        if (payload.new && (payload.new as Record<string, unknown>).pin === sessionPin) {
          applySessionDataRef.current(payload.new as Record<string, unknown>);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "uno_cards", filter: "session_pin=eq." + sessionPin }, (payload) => {
        const c = payload.new as { team_name: string; card_type: string };
        if (cardFlashTimerRef.current) clearTimeout(cardFlashTimerRef.current);
        setCardFlash({ team: c.team_name, type: c.card_type });
        cardFlashTimerRef.current = setTimeout(() => setCardFlash(null), 3000);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); clearInterval(pollInterval); };
  }, [sessionPin]);

  function applySessionData(data: Record<string, unknown>) {
    const newPhase = (data.phase as Phase) || "waiting";
    const newQ = data.current_question as Question | null;
    const newIdx = (data.current_question_index as number) ?? 0;
    const ft = (data.fastest_team as string) || null;

    setPhase(newPhase);
    setQuestion(newQ);
    setFastestTeamName(ft);
    setFastestSongName((data.fastest_song as string) || null);
    setSpinTargetIdx((data.spin_target_idx as number) ?? null);
    setBlockUntil((data.block_until as string) || null);
    setBlockTeam((data.block_team as string) || null);
    setHardDeckTeam((data.hard_deck_team as string) || null);
    setHardDeckStatus((data.hard_deck_status as string) || "idle");
    setHardDeckPotential((data.hard_deck_potential as number) || 0);
    setSpinOffered(!!data.spin_offered);
    setSpinChoice((data.spin_choice as string) || null);
    setIntermissionOffers((data.intermission_offers as string) || "");
    setIntermissionWhatsapp((data.intermission_whatsapp as string) || "");
    setIntermissionOtherQuizzes((data.intermission_other_quizzes as string) || "");

    // Reset answer state when phase changes to question OR question index changes
    if (newPhase === "question" && (newIdx !== lastQIndexRef.current || lastPhaseRef.current !== "question")) {
      lastQIndexRef.current = newIdx;
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

  async function submitAnswer(answer: string) {
    if (submitted || !answer.trim() || (timeLeft !== null && timeLeft <= 0)) return;
    setSubmitted(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.from("answers").insert({
      session_pin: sessionPin,
      team_name: teamName,
      question_index: questionIndex,
      answer_text: answer.trim(),
    });
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
    await supabase.from("sessions").update({ spin_choice: "spin" }).eq("pin", sessionPin);
  }

  async function choosePass() {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({ spin_choice: "pass" }).eq("pin", sessionPin);
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
    <div style={{ position: "sticky" as const, bottom: 0, marginTop: "auto", paddingTop: 10, paddingBottom: 4, borderTop: "1px solid rgba(255,255,255,0.06)", background: bg }}>
      <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} compact={true} />
    </div>
  );

  if (phase === "spin_to_win") {
    const isWinner = fastestTeamName === teamName;
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, gap: 16, textAlign: "center" as const }}>
        {isWinner ? (
          <div style={{ width: "100%" }}>
            <SlotReels targetIdx={spinTargetIdx} teamName={teamName} victorySong={fastestSongName || undefined} size="compact" />
          </div>
        ) : (
          <div style={{ fontSize: 16, color: "rgba(255,255,255,0.6)" }}>
            {fastestTeamName ? fastestTeamName + " is spinning — watch the big screen!" : "Watch the big screen!"}
          </div>
        )}
      </div>
    );
  }
  if (phase === "hard_deck") {
    const isSelected = hardDeckTeam === teamName;
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 20, textAlign: "center" as const }}>
        <div style={{ fontFamily: font, fontSize: 22, color: purple, letterSpacing: 3 }}>THE HARD DECK</div>
        {!isSelected && (
          <div style={{ fontSize: 16, color: "rgba(255,255,255,0.6)" }}>
            {hardDeckTeam ? hardDeckTeam + " is playing — watch the big screen!" : "Watch the big screen!"}
          </div>
        )}
        {isSelected && hardDeckStatus === "awaiting_guess" && (
          <>
            <div style={{ fontSize: 16, color: "#fff" }}>Higher or Lower?</div>
            <div style={{ display: "flex", gap: 16 }}>
              <button onClick={() => submitHardDeckGuess("higher")} style={{ padding: "18px 28px", borderRadius: 12, background: "rgba(34,197,94,0.25)", border: "2px solid #22c55e", color: "#fff", fontSize: 18, fontWeight: 700, cursor: "pointer" }}>HIGHER</button>
              <button onClick={() => submitHardDeckGuess("lower")} style={{ padding: "18px 28px", borderRadius: 12, background: "rgba(239,68,68,0.25)", border: "2px solid #ef4444", color: "#fff", fontSize: 18, fontWeight: 700, cursor: "pointer" }}>LOWER</button>
            </div>
          </>
        )}
        {isSelected && hardDeckStatus === "decision" && (
          <>
            <div style={{ fontSize: 16, color: "#facc15" }}>You have {hardDeckPotential} points!</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}>Stick with what you've got, or gamble for more?</div>
            <div style={{ display: "flex", gap: 16 }}>
              <button onClick={submitHardDeckStick} style={{ padding: "18px 28px", borderRadius: 12, background: "rgba(34,197,94,0.25)", border: "2px solid #22c55e", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>STICK</button>
              <button onClick={submitHardDeckGamble} style={{ padding: "18px 28px", borderRadius: 12, background: "rgba(190,38,193,0.25)", border: "2px solid " + purple, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>GAMBLE</button>
            </div>
          </>
        )}
        {isSelected && hardDeckStatus === "won" && (
          <div style={{ fontSize: 22, color: "#22c55e" }}>You won {hardDeckPotential} points! 🎉</div>
        )}
        {isSelected && hardDeckStatus === "lost" && (
          <div style={{ fontSize: 22, color: "#ef4444" }}>Busted — better luck next time!</div>
        )}
        {isSelected && (hardDeckStatus === "wheel" || hardDeckStatus === "base_revealed") && (
          <div style={{ fontSize: 16, color: "rgba(255,255,255,0.6)" }}>Watch the big screen!</div>
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
                <div style={{ fontSize: 16, color: "#facc15", fontWeight: 700, marginBottom: 12 }}>Spin to Win?</div>
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
              <div style={{ fontSize: 56, fontWeight: 900, color: "#22c55e", textShadow: "0 0 20px rgba(34,197,94,0.6)", lineHeight: 1 }}>+10</div>
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
        <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} compact={true} />
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
    const imageUrl = isPicture ? question.option_b : null;

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
      <div style={{ height: "100dvh", background: bg, display: "flex", flexDirection: "column", padding: "14px 16px", fontFamily: font, color: "#fff", overflowY: "auto" as const, boxSizing: "border-box" as const }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,0.3)" }}>Q{questionIndex + 1}</div>
          {timeLeft !== null && timeLeft > 0 && (
            <div style={{ marginLeft: "auto", width: 32, height: 32, borderRadius: "50%", background: timeLeft <= 3 ? "rgba(239,68,68,0.3)" : "rgba(190,38,193,0.2)", border: "2px solid " + (timeLeft <= 3 ? "#ef4444" : purple), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: timeLeft <= 3 ? "#ef4444" : purple }}>
              {timeLeft}
            </div>
          )}
        </div>

        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, marginBottom: 12, color: "#fff" }}>{question.question_text.replace(/^Play this track:\s*/i, "").replace(/^Show teams this image:\s*/i, "")}</div>

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

        <PowerCards />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: font }}>
      <div style={{ fontSize: 38, fontWeight: 800, color: purple, letterSpacing: 2, textAlign: "center", textShadow: "0 0 30px rgba(190,38,193,0.5)", marginBottom: 8 }}>You are In!</div>
      <div style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", marginBottom: 32 }}>{teamName} — good luck!</div>
      <div style={{ padding: "14px 20px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>STATUS</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Waiting for the quiz to start...</div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 10 }}>
          {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: purple, opacity: 0.6 }} />)}
        </div>
      </div>
      <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} />
    </div>
  );
}
