"use client";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Question = {
  question_text: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_answer: string;
  explanation?: string;
};

type Phase = "waiting" | "question" | "answer" | "celebration";

export default function DisplayScreen() {
  const [phase, setPhase] = useState<Phase>("waiting");
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [sessionPin, setSessionPin] = useState("");
  const timerRef = { current: null as ReturnType<typeof setInterval> | null };

  const font = "'Bruno Ace SC', sans-serif";
  const purple = "#BE26C1";
  const bg = "#080810";

  function applySession(data: Record<string, unknown>) {
    setPhase((data.phase as Phase) || "waiting");
    setQuestion((data.current_question as Question) || null);
    setQuestionIndex((data.current_question_index as number) ?? 0);
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

  async function connect() {
    if (pinInput.length !== 4) return;
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("sessions").select("*").eq("pin", pinInput).single();
    if (!data) { alert("Session not found"); return; }
    setSessionPin(pinInput);
    setConnected(true);
    applySession(data);
    supabase.channel("display-" + pinInput)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: "pin=eq." + pinInput }, (payload) => {
        applySession(payload.new as Record<string, unknown>);
      })
      .subscribe();
  }

  if (!connected) {
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font }}>
        <div style={{ background: "rgba(45,10,94,0.7)", border: "2px solid " + purple, borderRadius: 20, padding: 48, textAlign: "center", width: 380 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: purple, letterSpacing: 4, marginBottom: 8 }}>Display Screen</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 28 }}>Enter session PIN to connect</div>
          <input value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g,"").slice(0,4))}
            onKeyDown={e => e.key === "Enter" && connect()}
            placeholder="PIN" maxLength={4}
            style={{ width: "100%", padding: "16px", borderRadius: 12, background: "rgba(255,255,255,0.1)", color: "#fff", border: "2px solid rgba(190,38,193,0.6)", fontSize: 32, fontFamily: "monospace", textAlign: "center", letterSpacing: 12, outline: "none", marginBottom: 16, boxSizing: "border-box" }} />
          <button onClick={connect} disabled={pinInput.length !== 4}
            style={{ width: "100%", padding: 14, borderRadius: 12, background: pinInput.length === 4 ? purple : "#333", color: "#fff", border: "none", fontSize: 16, letterSpacing: 3, cursor: pinInput.length === 4 ? "pointer" : "not-allowed", fontFamily: font }}>
            Connect
          </button>
        </div>
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: font }}>
        <img src="/me-logo.jpg" alt="ME" style={{ width: 80, height: 80, borderRadius: "50%", marginBottom: 24, border: "3px solid " + purple }} />
        <div style={{ fontSize: 52, fontWeight: 800, color: purple, letterSpacing: 6, marginBottom: 8, textShadow: "0 0 40px rgba(190,38,193,0.6)" }}>Quiz-It</div>
        <div style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", letterSpacing: 3, marginBottom: 48 }}>powered by Mac Entertainment</div>
        <div style={{ padding: "32px 64px", borderRadius: 20, background: "rgba(255,255,255,0.05)", border: "2px solid rgba(190,38,193,0.4)", textAlign: "center" }}>
          <div style={{ fontSize: 18, color: "rgba(255,255,255,0.5)", letterSpacing: 4, marginBottom: 12 }}>JOIN AT</div>
          <div style={{ fontSize: 32, color: "#fff", fontWeight: 700, letterSpacing: 2, marginBottom: 24 }}>quiz-it-six.vercel.app/join</div>
          <div style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", letterSpacing: 3, marginBottom: 12 }}>ENTER PIN</div>
          <div style={{ fontSize: 120, fontWeight: 900, color: "#fff", letterSpacing: 24, fontFamily: "monospace", lineHeight: 1, textShadow: "0 0 60px rgba(190,38,193,0.8)" }}>{sessionPin}</div>
        </div>
      </div>
    );
  }

  if (phase === "celebration") {
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: font }}>
        <div style={{ fontSize: 96, marginBottom: 24 }}>🎉</div>
        <div style={{ fontSize: 64, fontWeight: 800, color: purple, letterSpacing: 4, textShadow: "0 0 60px rgba(190,38,193,0.8)" }}>Round Over!</div>
        <div style={{ fontSize: 22, color: "rgba(255,255,255,0.5)", marginTop: 16, letterSpacing: 2 }}>Quiz-It · Mac Entertainment</div>
      </div>
    );
  }

  if (phase === "answer" && question) {
    const options = [
      { key: "A", text: question.option_a },
      { key: "B", text: question.option_b },
      { key: "C", text: question.option_c },
      { key: "D", text: question.option_d },
    ].filter(o => o.text);
    const isMulti = question.question_type === "multiple_choice";

    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", padding: "48px 80px", fontFamily: font, color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
          <div style={{ fontSize: 13, letterSpacing: 4, color: "rgba(255,255,255,0.3)" }}>Q{questionIndex + 1}</div>
          <div style={{ padding: "4px 16px", borderRadius: 999, background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.5)", fontSize: 13, color: "#22c55e", letterSpacing: 2 }}>ANSWER REVEALED</div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.3)", letterSpacing: 2 }}>Quiz-It</div>
        </div>

        <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.35, marginBottom: 40, maxWidth: "85%" }}>{question.question_text}</div>

        {isMulti && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
            {options.map(opt => {
              const isCorrect = opt.key.toLowerCase() === question.correct_answer.toLowerCase();
              return (
                <div key={opt.key} style={{ padding: "20px 28px", borderRadius: 16, background: isCorrect ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.05)", border: "2px solid " + (isCorrect ? "rgba(34,197,94,0.7)" : "rgba(255,255,255,0.1)"), fontSize: 24, display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ color: purple, fontWeight: 800, fontSize: 22 }}>{opt.key}.</span>
                  <span style={{ color: isCorrect ? "#22c55e" : "#fff", fontWeight: isCorrect ? 700 : 400 }}>{opt.text}</span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ padding: "24px 32px", borderRadius: 16, background: "rgba(34,197,94,0.15)", border: "2px solid rgba(34,197,94,0.5)", maxWidth: 600 }}>
          <div style={{ fontSize: 13, color: "rgba(34,197,94,0.7)", letterSpacing: 3, marginBottom: 8 }}>CORRECT ANSWER</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: "#22c55e" }}>{question.correct_answer}</div>
          {question.explanation && <div style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", marginTop: 10 }}>{question.explanation}</div>}
        </div>
      </div>
    );
  }

  if (phase === "question" && question) {
    const options = [
      { key: "A", text: question.option_a },
      { key: "B", text: question.option_b },
      { key: "C", text: question.option_c },
      { key: "D", text: question.option_d },
    ].filter(o => o.text);
    const isMulti = question.question_type === "multiple_choice";

    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column", padding: "48px 80px", fontFamily: font, color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
          <div style={{ fontSize: 13, letterSpacing: 4, color: "rgba(255,255,255,0.3)" }}>Q{questionIndex + 1}</div>
          <div style={{ padding: "4px 16px", borderRadius: 999, background: "rgba(190,38,193,0.2)", border: "1px solid rgba(190,38,193,0.4)", fontSize: 13, color: purple, letterSpacing: 2 }}>LIVE</div>
          <div style={{ flex: 1 }} />
          {timeLeft !== null && timeLeft > 0 && (
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: timeLeft <= 3 ? "rgba(239,68,68,0.3)" : "rgba(190,38,193,0.2)", border: "3px solid " + (timeLeft <= 3 ? "#ef4444" : purple), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: timeLeft <= 3 ? "#ef4444" : purple }}>
              {timeLeft}
            </div>
          )}
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.3)", letterSpacing: 2 }}>Quiz-It</div>
        </div>

        <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.35, marginBottom: 40, maxWidth: "85%" }}>{question.question_text}</div>

        {isMulti && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {options.map(opt => (
              <div key={opt.key} style={{ padding: "20px 28px", borderRadius: 16, background: "rgba(255,255,255,0.06)", border: "2px solid rgba(190,38,193,0.25)", fontSize: 24, display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ color: purple, fontWeight: 800, fontSize: 22 }}>{opt.key}.</span>
                <span>{opt.text}</span>
              </div>
            ))}
          </div>
        )}

        {!isMulti && (
          <div style={{ padding: "20px 28px", borderRadius: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", fontSize: 20, color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>
            Type your answer on your phone
          </div>
        )}
      </div>
    );
  }

  return null;
}
