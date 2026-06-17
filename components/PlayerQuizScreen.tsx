'use client';
import React, { useEffect, useState, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { UnoPlayerCards } from "@/components/UnoCards";
import { AnswerKeypad } from "@/components/AnswerKeypad";

type Question = {
  question_text: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_answer: string;
};

type Phase = "waiting" | "question" | "answer" | "celebration";

interface Props {
  teamName: string;
  sessionPin: string;
}

function SequenceQuestion({ options, onSubmit, submitted }: { options: string[]; onSubmit: (ans: string) => void; submitted: boolean }) {
  const [order, setOrder] = useState<string[]>(options);
  function moveUp(i: number) { if (i === 0) return; const o = [...order]; [o[i-1], o[i]] = [o[i], o[i-1]]; setOrder(o); }
  function moveDown(i: number) { if (i === order.length-1) return; const o = [...order]; [o[i], o[i+1]] = [o[i+1], o[i]]; setOrder(o); }
  const purple = "#BE26C1";
  const font = "'Bruno Ace SC', sans-serif";
  if (submitted) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 4 }}>TAP ARROWS TO REORDER</div>
      {order.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(190,38,193,0.25)" }}>
          <span style={{ color: purple, fontWeight: 800, minWidth: 20, fontSize: 14 }}>{i+1}.</span>
          <span style={{ flex: 1, color: "#fff", fontSize: 14, fontFamily: font }}>{item}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <button type="button" onClick={() => moveUp(i)} disabled={i===0} style={{ padding: "3px 8px", borderRadius: 4, background: i===0?"rgba(255,255,255,0.04)":"rgba(190,38,193,0.2)", border: "none", color: i===0?"#444":purple, cursor: i===0?"default":"pointer", fontSize: 11 }}>▲</button>
            <button type="button" onClick={() => moveDown(i)} disabled={i===order.length-1} style={{ padding: "3px 8px", borderRadius: 4, background: i===order.length-1?"rgba(255,255,255,0.04)":"rgba(190,38,193,0.2)", border: "none", color: i===order.length-1?"#444":purple, cursor: i===order.length-1?"default":"pointer", fontSize: 11 }}>▼</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onSubmit(order.join(", "))}
        style={{ marginTop: 4, padding: "12px", borderRadius: 12, background: purple, color: "#fff", border: "none", fontSize: 15, fontFamily: font, letterSpacing: 2, cursor: "pointer" }}>
        Submit Order
      </button>
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
  const [answerText, setAnswerText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [fastestTeamName, setFastestTeamName] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastQIndexRef = useRef(-1);
  const lastPhaseRef = useRef<string>("");

  const [debugLog, setDebugLog] = useState<string[]>([]);
  const addDebug = (msg: string) => setDebugLog(prev => [...prev.slice(-4), msg]);

  const bg = "#080810";
  const purple = "#BE26C1";
  const font = "'Bruno Ace SC', sans-serif";

  // Keep screen awake
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
        .select("phase, current_question, current_question_index, timer_started_at, timer_duration, fastest_team")
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

    // Reset answer state when phase changes to question OR question index changes
    if (newPhase === "question" && (newIdx !== lastQIndexRef.current || lastPhaseRef.current !== "question")) {
      lastQIndexRef.current = newIdx;
      setQuestionIndex(newIdx);
      setSelectedAnswer("");
      setAnswerText("");
      setSubmitted(false);
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
    if (submitted || !answer.trim()) return;
    setSubmitted(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.from("answers").insert({
      session_pin: sessionPin,
      team_name: teamName,
      question_index: questionIndex,
      answer_text: answer.trim(),
    });
  }

  function getCorrectAnswerText(q: Question): string {
    if (q.question_type === "multiple_choice") {
      const key = q.correct_answer.toLowerCase();
      const map: Record<string, string | null> = { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d };
      return map[key] || q.correct_answer;
    }
    return q.correct_answer;
  }

  const PowerCards = () => (
    <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} compact={true} />
    </div>
  );

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
        <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", letterSpacing: 3, textAlign: "center", lineHeight: 1.2, marginBottom: 20, animation: "flash 0.8s ease-in-out infinite", textShadow: "0 0 20px rgba(255,255,255,0.6)" }}>FASTEST<br/>CORRECT ANSWER</div>
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
        ) : fastestTeamName ? (
          <>
            <div style={{ fontSize: 48, fontWeight: 900, color: purple, letterSpacing: 2, textAlign: "center", textShadow: "0 0 30px rgba(190,38,193,0.6)", marginBottom: 24 }}>{fastestTeamName}</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 64, marginBottom: 8 }}>{"😬"}</div>
            <div style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>Better luck next time!</div>
          </>
        )}
        <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} compact={true} />
      </div>
    );
  }

  if (phase === "answer" && question) {
    const correctText = getCorrectAnswerText(question);
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", padding: 20, fontFamily: font, color: "#fff" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,0.3)", marginBottom: 12 }}>ANSWER REVEALED</div>
        <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.4, marginBottom: 16, color: "rgba(255,255,255,0.8)" }}>{question.question_text}</div>
        <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.5)", marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "rgba(34,197,94,0.7)", letterSpacing: 3, marginBottom: 4 }}>CORRECT ANSWER</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#22c55e" }}>{correctText}</div>
        </div>
        {submitted && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
            Your answer: {selectedAnswer ? selectedAnswer.toUpperCase() + ". " + (question[("option_" + selectedAnswer) as keyof Question] as string) : answerText}
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
    const imageUrl = isPicture ? question.option_b : null;

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

    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", padding: 20, fontFamily: font, color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,0.3)" }}>Q{questionIndex + 1}</div>
          {timeLeft !== null && timeLeft > 0 && (
            <div style={{ marginLeft: "auto", width: 40, height: 40, borderRadius: "50%", background: timeLeft <= 3 ? "rgba(239,68,68,0.3)" : "rgba(190,38,193,0.2)", border: "2px solid " + (timeLeft <= 3 ? "#ef4444" : purple), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: timeLeft <= 3 ? "#ef4444" : purple }}>
              {timeLeft}
            </div>
          )}
        </div>

        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.45, marginBottom: 20, color: "#fff" }}>{question.question_text}</div>

        {isMultiChoice && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {options.map(opt => {
              const isSelected = selectedAnswer === opt.key;
              return (
                <button key={opt.key} type="button"
                  onClick={() => { if (!submitted) setSelectedAnswer(opt.key); }}
                style={{ padding: "12px 16px", borderRadius: 12, border: "1.5px solid", borderColor: isSelected ? purple : "rgba(255,255,255,0.15)", background: isSelected ? "rgba(190,38,193,0.25)" : "rgba(255,255,255,0.06)", color: "#fff", fontSize: 15, fontFamily: font, textAlign: "left" as const, cursor: submitted ? "default" : "pointer", display: "flex", alignItems: "center", gap: 10, opacity: submitted && !isSelected ? 0.35 : 1 }}>
                  <span style={{ color: isSelected ? "#fff" : purple, fontWeight: 700, minWidth: 18 }}>{opt.key.toUpperCase()}.</span>
                  {opt.text}
                  {isSelected && !submitted && <span style={{ marginLeft: "auto", fontSize: 14, color: purple }}>●</span>}
                  {isSelected && submitted && <span style={{ marginLeft: "auto", fontSize: 14, color: "#22c55e" }}>✓</span>}
                </button>
              );
            })}
            {!submitted && selectedAnswer && (
              <button type="button" onClick={() => submitAnswer(selectedAnswer)}
                style={{ padding: "12px", borderRadius: 12, background: purple, color: "#fff", border: "none", fontSize: 15, fontFamily: font, letterSpacing: 2, cursor: "pointer", marginTop: 4 }}>
                LOCK IN ANSWER
              </button>
            )}
            {submitted && <div style={{ fontSize: 12, color: "#22c55e", textAlign: "center" as const, marginTop: 4, letterSpacing: 2 }}>ANSWER LOCKED IN ✓</div>}
          </div>
        )}

        {isSequence && (
          <SequenceQuestion options={seqItems} onSubmit={submitAnswer} submitted={submitted} />
        )}

        {!isMultiChoice && !isSequence && !submitted && (
          <div style={{ marginBottom: 16 }}>
            <AnswerKeypad mode={question.question_type === "number" ? "number" : "text"} onSubmit={submitAnswer} />
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
      {debugLog.length > 0 && (
        <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 2, marginBottom: 6 }}>DEBUG</div>
          {debugLog.map((msg, i) => (
            <div key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>{msg}</div>
          ))}
        </div>
      )}
    </div>
  );
}
