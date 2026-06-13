'use client';
import { useEffect, useState, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { UnoPlayerCards } from "@/components/UnoCards";

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

export function PlayerQuizScreen({ teamName, sessionPin }: Props) {
  const [phase, setPhase] = useState<Phase>("waiting");
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastQIndexRef = useRef(-1);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function fetchSession() {
      const { data } = await supabase
        .from("sessions")
        .select("phase, current_question, current_question_index, timer_started_at, timer_duration")
        .eq("pin", sessionPin)
        .single();
      if (data) applySessionData(data);
    }

    fetchSession();

    const channel = supabase
      .channel("player-session-" + sessionPin)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "sessions",
        filter: "pin=eq." + sessionPin,
      }, (payload) => {
        applySessionData(payload.new);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionPin]);

  function applySessionData(data: Record<string, unknown>) {
    const newPhase = (data.phase as Phase) || "waiting";
    const newQ = data.current_question as Question | null;
    const newIdx = (data.current_question_index as number) ?? 0;

    setPhase(newPhase);
    setQuestion(newQ);

    if (newIdx !== lastQIndexRef.current) {
      lastQIndexRef.current = newIdx;
      setQuestionIndex(newIdx);
      setSelectedAnswer("");
      setAnswerText("");
      setSubmitted(false);
    }

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
        if (prev === null || prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
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

  const bg = "#080810";
  const purple = "#BE26C1";
  const font = "'Bruno Ace SC', sans-serif";

  if (phase === "celebration") {
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: font }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: purple, letterSpacing: 2, textAlign: "center",extShadow: "0 0 30px rgba(190,38,193,0.6)" }}>Round Over!</div>
        <div style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", marginTop: 8 }}>{teamName}</div>
        <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} />
      </div>
    );
  }

  if (phase === "answer" && question) {
    const correct = question.correct_answer;
    const playerGotIt = submitted && (
      selectedAnswer === correct ||
      answerText.trim().toLowerCase() === correct.toLowerCase()
    );
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", padding: 24, fontFamily: font, color: "#fff" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,0.3)", marginBottom: 16 }}>ANSWER REVEALED</div>
        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.4, marginBottom: 20, color: "rgba(255,255,255,0.8)" }}>{question.question_text}</div>
        <div style={{ padding: "16px 20px", borderRadius: 12, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.5)", marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "rgba(34,197,94,0.7)", letterSpacing: 3, marginBottom: 4 }}>CORRECT ANSWER</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#22c55e" }}>{correct}</div>
        </div>
        {submitted && (
          <div style={{ fontSize: 14, color: playerGotIt ? "#22c55e" : "#f87171", textAlign: "center", marginBottom: 12 }}>
            {playerGotIt ? "You got it!" : "Better luck next time!"}
          </div>
        )}
        <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} />
      </div>
    );
  }

  if (phase === "question" && question) {
    const isMultiChoice = question.question_type === "multiple_choice";
    const options = [
      { key: "a", text: question.option_a },
      { key: "b", text: question.option_b },
      { key: "c", text: question.option_c },
      { key: "d", text: question.option_d },
    ].filter(o => o.text);

    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", padding: 20, fontFamily: font, color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,0.3)" }}>QUESTION {questionIndex + 1}</div>
          {timeLeft !== null && timeLeft > 0 && (
            <div style={{
              marginLeft: "auto", width: 44, height: 44, borderRadius: "50%",
              background: timeLeft <= 3 ? "rgba(239,68,68,0.3)" : "rgba(190,38,193,0.2)",
              border: "2px solid " + (timeLeft <= 3 ? "#ef4444" : purple),
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 800, color: timeLeft <= 3 ? "#ef4444" : purple,
              animation: timeLeft <= 3 ? "pulse 0.5s infinite" : "none",
            }}>{timeLeft}</div>
          )}
        </div>

        <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.45, marginBottom: 24, color: "#fff" }}>{question.question_text}</div>

        {isMultiChoice && !submitted && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {options.map(opt => (
              <button key={opt.key} type="button"
                onClick={() => { setSelectedAnswer(opt.key); submitAnswer(opt.key); }}
                style={{
                  padding: "14px 18px", borderRadius: 12, border: "1.5px solid",
                  borderColor: selectedAnswer === opt.key ? purple : "rgba(255,255,255,0.15)",
                  background: selectedAnswer === opt.key ? "rgba(190,38,193,0.25)" : "rgba(255,255,255,0.06)",
                  color: "#fff", fontSize: 16, fontFamily: font, textAlign: "left", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                <span style={{ color: purple, fontWeight: 700, minWidth: 20 }}>{opt.key.toUpperCase()}.</span>
                {opt.text}
              </button>
            ))}
          </div>
        )}

        {!isMultiChoice && !submitted && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            <input
              value={answerText}
              onChange={e => setAnswerText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submitAnswer(answerText)}
              placeholder="Type your answer..."
              autoFocus
              style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.1)", color: "#fff", border: "1.5px solid rgba(190,38,193,0.6)", fontSize: 18, fontFamily: font, outline: "none" }}
            />
            <button type="button" onClick={() => submitAnswer(answerText)} disabled={!answerText.trim()}
              style={{ padding: "14px", borderRadius: 12, background: answerText.trim() ? purple : "#1a1a2e", color: answerText.trim() ? "#fff" : "rgba(255,255,255,0.3)", border: "none", fontSize: 16, fontFamily: font, letterSpacing: 2, cursor: answerText.trim() ? "pointer" : "default" }}>
              Submit Answer
            </button>
          </div>
        )}

        {submitted && (
          <div style={{ padding: "16px 20px", borderRadius: 12, background: "rgba(190,38,193,0.15)", border: "1px solid rgba(190,38,193,0.4)", textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 16, color: purple, fontWeight: 700 }}>Answer Submitted!</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Waiting for host...</div>
          </div>
        )}

        <div style={{ marginTop: "auto" }}>
          <UnoPlayerCards teamName={teamName} sessionPin={sessionPin} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: font }}>
      <div style={{ fontSize: 42, fontWeight: 800, color: purple, letterSpacing: 2, textAlign: "center", textShadow: "0 0 30px rgba(190,38,193,0.5)", marginBottom: 8 }}>You are In!</div>
      <div style={{ fontSize: 18, color: "rgba(255,255,255,0.6)", marginBottom: 32 }}>{teamName} — good luck!</div>
      <div style={{ padding: "16px 24px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>STATUS</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Waiting for the quiz to start...</div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 12 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: purple, opacity: 0.6, animation: "pulse 1.5s " + (i * 0.3) + "s infinite" }} />
          ))}
        </div>
      </div>
      <UnoPlayerCards teamName={teamName} sessionPi{sessionPin} />
    </div>
  );
}
