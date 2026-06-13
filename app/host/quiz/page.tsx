"use client";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
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
  difficulty: string;
  round_type: string;
};

type Round = {
  id: string;
  name: string;
  questions: Question[];
};

type Team = {
  id: string;
  team_name: string;
  victory_song: string;
  session_pin: string;
  last_seen?: string;
};

type Answer = {
  session_pin: string;
  id: string;
  team_name: string;
  question_index: number;
  answer_text: string;
  submitted_at: string;
};

type UnoCard = {
  id: string;
  team_name: string;
  card_type: string;
  played_at: string;
};

const typeColor: Record<string,string> = {
  multiple_choice:"#a78bfa", text_answer:"#34d399",
  number:"#fbbf24", sequence:"#f472b6",
  picture:"#38bdf8", audio:"#fb923c"
};
const typeLabel: Record<string,string> = {
  multiple_choice:"Multiple Choice", text_answer:"Text Answer",
  number:"Number", sequence:"Sequence",
  picture:"Picture Round", audio:"Name That Tune"
};
const cardColor: Record<string,string> = {
  block:"#60a5fa", reverse:"#f87171", x2:"#facc15"
};
const cardLabel: Record<string,string> = {
  block:"Block", reverse:"Reverse", x2:"x2"
};

export default function QuizController() {
  const searchParams = useSearchParams();
  const [sessionPin, setSessionPin] = useState("");
  const [sessionId, setSessionId] = useState<string|null>(null);
  const [connected, setConnected] = useState(false);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedRound, setSelectedRound] = useState<Round|null>(null);
  const [qIdx, setQIdx] = useState(0);
  const [phase, setPhase] = useState<"waiting"|"question"|"answer"|"celebration">("waiting");
  const [teams, setTeams] = useState<Team[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [unoCards, setUnoCards] = useState<UnoCard[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [pinInput, setPinInput] = useState("");

  const currentQ = selectedRound?.questions[qIdx] || null;

  useEffect(() => { loadRounds(); }, []);

  useEffect(() => {
    const pinFromUrl = searchParams.get("pin");
    if (pinFromUrl && pinFromUrl.length === 4 && !connected) {
      setPinInput(pinFromUrl);
      setTimeout(() => connectWithPin(pinFromUrl), 500);
    }
  }, [searchParams]);

  async function loadRounds() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("rounds").select("id, name, questions").order("created_at", { ascending: false });
    if (data) setRounds(data);
  }

  async function connectWithPin(p: string) {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("sessions").select("*").eq("pin", p.trim()).single();
    if (!data) return;
    setSessionPin(p.trim());
    setSessionId(data.id);
    setPhase(data.phase || "waiting");
    setConnected(true);
    loadTeams(p.trim());
    loadAnswers(p.trim(), 0);
    loadUnoCards(p.trim());
    subscribeToUpdates(p.trim());
  }

  async function connectToSession() {
    if (!pinInput.trim()) return;
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("sessions").select("*").eq("pin", pinInput.trim()).single();
    if (!data) { alert("Session not found!"); return; }
    setSessionPin(pinInput.trim());
    setSessionId(data.id);
    setPhase(data.phase || "waiting");
    setConnected(true);
    loadTeams(pinInput.trim());
    loadAnswers(pinInput.trim(), 0);
    loadUnoCards(pinInput.trim());
    subscribeToUpdates(pinInput.trim());
  }

  async function loadTeams(pin: string) {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("teams").select("*").eq("session_pin", pin).order("created_at", { ascending: true });
    if (data) setTeams(data);
  }

  async function loadAnswers(pin: string, idx: number) {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("answers").select("*").eq("session_pin", pin).eq("question_index", idx).order("submitted_at", { ascending: true });
    if (data) setAnswers(data);
  }

  async function loadUnoCards(pin?: string) {
    const supabase = createSupabaseBrowserClient();
    let q = supabase.from("uno_cards").select("*").order("played_at", { ascending: false });
    const { data } = await q;
    if (data) setUnoCards(data);
  }

  function subscribeToUpdates(pin: string) {
    const supabase = createSupabaseBrowserClient();
    supabase.channel("quiz-host-" + pin)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "answers" }, (payload) => {
        const a = payload.new as Answer;
        if (a.session_pin === pin) setAnswers(prev => [...prev, a]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "teams" }, (payload) => {
        const t = payload.new as Team;
        if (t.session_pin === pin) setTeams(prev => [...prev, t]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "uno_cards" }, (payload) => {
        setUnoCards(prev => [payload.new as UnoCard, ...prev]);
      })
      .subscribe();
  }

  async function pushPhase(newPhase: string, extra?: Record<string,unknown>) {
    if (!sessionId) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("sessions").update({
      phase: newPhase,
      current_question: currentQ,
      current_question_index: qIdx,
      ...extra
    }).eq("id", sessionId);
    setPhase(newPhase as "waiting"|"question"|"answer"|"celebration");
  }

  async function showQuestion() {
    setRevealed(false);
    setAnswers([]);
    await pushPhase("question");
    if (sessionPin) loadAnswers(sessionPin, qIdx);
  }

  async function revealAnswer() {
    setRevealed(true);
    await pushPhase("answer");
  }

  async function nextQuestion() {
    if (!selectedRound) return;
    const next = qIdx + 1;
    if (next >= selectedRound.questions.length) return;
    setQIdx(next);
    setRevealed(false);
    setAnswers([]);
    await pushPhase("question", { current_question_index: next, current_question: selectedRound.questions[next] });
    if (sessionPin) loadAnswers(sessionPin, next);
  }

  async function prevQuestion() {
    if (qIdx === 0) return;
    const prev = qIdx - 1;
    setQIdx(prev);
    setRevealed(false);
    setAnswers([]);
    await pushPhase("question", { current_question_index: prev, current_question: selectedRound?.questions[prev] });
    if (sessionPin) loadAnswers(sessionPin, prev);
  }

  async function triggerCelebration() {
    await pushPhase("celebration");
  }

  const teamHasAnswered = (teamName: string) => answers.some(a => a.team_name === teamName);
  const teamAnswer = (teamName: string) => answers.find(a => a.team_name === teamName)?.answer_text || "";
  const teamCards = (teamName: string) => unoCards.filter(c => c.team_name === teamName);

  if (!connected) {
    return (
      <div style={{ minHeight:"100vh", background:"linear-gradient(160deg, #1a0535 0%, #0d0225 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"sans-serif" }}>
        <div style={{ background:"rgba(45,10,94,0.7)", border:"2px solid #BE26C1", borderRadius:20, padding:48, textAlign:"center", width:400 }}>
          <div style={{ fontSize:28, fontWeight:700, color:"#BE26C1", letterSpacing:4, marginBottom:8 }}>Quiz Controller</div>
          <div style={{ fontSize:15, color:"rgba(255,255,255,0.7)", marginBottom:32 }}>Enter the session PIN to connect</div>
          <input value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g,"").slice(0,4))}
            onKeyDown={e => e.key==="Enter" && connectToSession()}
            placeholder="PIN" maxLength={4}
            style={{ width:"100%", padding:"16px", borderRadius:12, background:"rgba(255,255,255,0.1)", color:"#fff", border:"2px solid rgba(190,38,193,0.6)", fontSize:32, fontFamily:"monospace", textAlign:"center", letterSpacing:12, outline:"none", marginBottom:16, boxSizing:"border-box" as const }} />
          <button onClick={connectToSession} disabled={pinInput.length!==4}
            style={{ width:"100%", padding:16, borderRadius:12, background:pinInput.length===4?"#BE26C1":"#333", color:"#fff", border:"none", fontSize:18, letterSpacing:4, cursor:pinInput.length===4?"pointer":"not-allowed" }}>
            Connect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg, #1a0535 0%, #0d0225 100%)", fontFamily:"sans-serif", color:"#fff", display:"flex", flexDirection:"column" as const }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"16px 24px", borderBottom:"1px solid rgba(190,38,193,0.3)", background:"rgba(45,10,94,0.5)" }}>
        <div style={{ width:44, height:44, borderRadius:"50%", background:"#2d0a5e", border:"2px solid #BE26C1", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#BE26C1", fontWeight:700 }}>ME</div>
        <div style={{ fontSize:20, fontWeight:700, color:"#BE26C1", letterSpacing:3 }}>Quiz Controller</div>
        <div style={{ marginLeft:8, padding:"4px 12px", borderRadius:999, background:"rgba(190,38,193,0.2)", border:"1px solid rgba(190,38,193,0.4)", fontSize:13, color:"#BE26C1" }}>PIN: {sessionPin}</div>
        <div style={{ padding:"4px 12px", borderRadius:999, fontSize:13, fontWeight:700,
          background: phase==="question"?"rgba(34,197,94,0.2)":phase==="answer"?"rgba(251,191,36,0.2)":phase==="celebration"?"rgba(190,38,193,0.2)":"rgba(255,255,255,0.1)",
          color: phase==="question"?"#22c55e":phase==="answer"?"#fbbf24":phase==="celebration"?"#BE26C1":"#aaa",
          border: "1px solid " + (phase==="question"?"rgba(34,197,94,0.4)":phase==="answer"?"rgba(251,191,36,0.4)":phase==="celebration"?"rgba(190,38,193,0.4)":"rgba(255,255,255,0.2)")
        }}>{phase.toUpperCase()}</div>
        <div style={{ flex:1 }} />
        <select value={selectedRound?.id||""} onChange={e => { const r = rounds.find(x=>x.id===e.target.value); setSelectedRound(r||null); setQIdx(0); setRevealed(false); setAnswers([]); }}
          style={{ padding:"8px 14px", borderRadius:8, background:"rgba(255,255,255,0.1)", color:"#fff", border:"1px solid rgba(190,38,193,0.4)", fontSize:14, cursor:"pointer" }}>
          <option value="">Select a round...</option>
          {rounds.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <a href="/host/spin" target="_blank" style={{ padding:"8px 16px", borderRadius:8, background:"rgba(190,38,193,0.3)", border:"1px solid #BE26C1", color:"#fff", textDecoration:"none", fontSize:13, letterSpacing:1 }}>Spin to Win</a>
        <a href="/host/display" target="_blank" style={{ padding:"8px 16px", borderRadius:8, background:"#BE26C1", color:"#fff", textDecoration:"none", fontSize:13, letterSpacing:1 }}>Display Screen</a>
      </div>

      <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 380px", gap:0, overflow:"hidden" }}>
        <div style={{ padding:24, overflowY:"auto" as const, borderRight:"1px solid rgba(190,38,193,0.2)" }}>
          {!selectedRound ? (
            <div style={{ textAlign:"center", marginTop:80, color:"rgba(255,255,255,0.4)", fontSize:18 }}>Select a round from the dropdown above to begin</div>
          ) : !currentQ ? (
            <div style={{ textAlign:"center", marginTop:80, color:"rgba(255,255,255,0.4)", fontSize:18 }}>No questions in this round</div>
          ) : (
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
                <span style={{ background:"rgba(190,38,193,0.2)", color:"#BE26C1", padding:"4px 14px", borderRadius:999, fontSize:13, fontWeight:600 }}>Q{qIdx+1} of {selectedRound.questions.length}</span>
                <span style={{ background:"rgba(255,255,255,0.1)", color:typeColor[currentQ.question_type]||"#aaa", padding:"4px 14px", borderRadius:999, fontSize:13, fontWeight:600 }}>{typeLabel[currentQ.question_type]||currentQ.question_type}</span>
                <span style={{ fontSize:13, color:"rgba(255,255,255,0.4)" }}>{currentQ.difficulty}</span>
              </div>

              <div style={{ fontSize:28, fontWeight:700, lineHeight:1.4, marginBottom:24, color:"#fff" }}>{currentQ.question_text}</div>

              {currentQ.question_type==="multiple_choice" && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
                  {(["a","b","c","d"] as const).map(l => {
                    const opt = currentQ[("option_"+l) as keyof Question] as string;
                    const isCorrect = l===currentQ.correct_answer;
                    return opt ? (
                      <div key={l} style={{ padding:"12px 16px", borderRadius:10, background:revealed&&isCorrect?"rgba(34,197,94,0.2)":"rgba(255,255,255,0.07)", border:"1px solid "+(revealed&&isCorrect?"rgba(34,197,94,0.6)":"rgba(255,255,255,0.15)"), fontSize:16 }}>
                        <span style={{ color:"#BE26C1", fontWeight:700, marginRight:8 }}>{l.toUpperCase()}.</span>
                        <span style={{ color:revealed&&isCorrect?"#22c55e":"#fff" }}>{opt}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              )}

              {currentQ.question_type==="sequence" && (
                <div style={{ marginBottom:20 }}>
                  {[currentQ.option_a,currentQ.option_b,currentQ.option_c,currentQ.option_d].filter(Boolean).map((item,idx) => (
                    <div key={idx} style={{ padding:"10px 16px", borderRadius:8, background:"rgba(255,255,255,0.07)", marginBottom:6, display:"flex", gap:10, fontSize:15 }}>
                      <span style={{ color:"#BE26C1", fontWeight:700, minWidth:24 }}>{idx+1}.</span>{item}
                    </div>
                  ))}
                </div>
              )}

              {currentQ.question_type==="audio" && currentQ.option_b && (
                <div style={{ marginBottom:20 }}>
                  <a href={currentQ.option_b} target="_blank" rel="noopener noreferrer"
                    style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"12px 24px", borderRadius:10, background:"rgba(251,146,60,0.2)", border:"1px solid rgba(251,146,60,0.5)", color:"#fb923c", textDecoration:"none", fontSize:16, fontWeight:600 }}>
                    Play on YouTube
                  </a>
                </div>
              )}

              {currentQ.question_type==="picture" && currentQ.option_a && (
                <div style={{ marginBottom:20 }}>
                  <a href={"https://www.google.com/search?tbm=isch&q="+encodeURIComponent(currentQ.option_a)} target="_blank" rel="noopener noreferrer"
                    style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"12px 24px", borderRadius:10, background:"rgba(56,189,248,0.2)", border:"1px solid rgba(56,189,248,0.5)", color:"#38bdf8", textDecoration:"none", fontSize:16, fontWeight:600 }}>
                    Open Image
                  </a>
                </div>
              )}

              {revealed && (
                <div style={{ padding:"16px 20px", borderRadius:12, background:"rgba(34,197,94,0.15)", border:"1px solid rgba(34,197,94,0.4)", marginBottom:20 }}>
                  <div style={{ fontSize:13, color:"rgba(34,197,94,0.7)", marginBottom:4, letterSpacing:2 }}>ANSWER</div>
                  <div style={{ fontSize:24, fontWeight:700, color:"#22c55e" }}>{currentQ.correct_answer}</div>
                  {currentQ.explanation && <div style={{ fontSize:14, color:"rgba(255,255,255,0.6)", marginTop:8 }}>{currentQ.explanation}</div>}
                </div>
              )}

              <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const }}>
                <button onClick={prevQuestion} disabled={qIdx===0}
                  style={{ padding:"12px 24px", borderRadius:10, background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.2)", color:qIdx===0?"#444":"#fff", cursor:qIdx===0?"not-allowed":"pointer", fontSize:15 }}>
                  Previous
                </button>
                <button onClick={showQuestion}
                  style={{ padding:"12px 24px", borderRadius:10, background:"rgba(190,38,193,0.3)", border:"1px solid #BE26C1", color:"#fff", cursor:"pointer", fontSize:15, letterSpacing:2 }}>
                  Show Question
                </button>
                <button onClick={revealAnswer} disabled={revealed}
                  style={{ padding:"12px 24px", borderRadius:10, background:revealed?"#1a1a1a":"rgba(34,197,94,0.3)", border:"1px solid "+(revealed?"#333":"rgba(34,197,94,0.6)"), color:revealed?"#444":"#22c55e", cursor:revealed?"not-allowed":"pointer", fontSize:15, letterSpacing:2 }}>
                  Reveal Answer
                </button>
                <button onClick={triggerCelebration}
                  style={{ padding:"12px 24px", borderRadius:10, background:"rgba(251,191,36,0.2)", border:"1px solid rgba(251,191,36,0.5)", color:"#fbbf24", cursor:"pointer", fontSize:15 }}>
                  Celebrate
                </button>
                <button onClick={nextQuestion} disabled={!selectedRound||qIdx>=selectedRound.questions.length-1}
                  style={{ padding:"12px 24px", borderRadius:10, background:"#BE26C1", border:"none", color:"#fff", cursor:"pointer", fontSize:15, letterSpacing:2, marginLeft:"auto" }}>
                  Next Question
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ overflowY:"auto" as const, display:"flex", flexDirection:"column" as const }}>
          <div style={{ padding:"16px 20px", borderBottom:"1px solid rgba(190,38,193,0.2)", background:"rgba(45,10,94,0.3)" }}>
            <div style={{ fontSize:15, fontWeight:700, color:"#fff", marginBottom:12 }}>Teams <span style={{ color:"#BE26C1" }}>{teams.length}</span></div>
            {teams.map(team => {
              const answered = teamHasAnswered(team.team_name);
              const ans = teamAnswer(team.team_name);
              const cards = teamCards(team.team_name);
              return (
                <div key={team.id} style={{ padding:"10px 12px", borderRadius:10, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(190,38,193,0.15)", marginBottom:8 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:answered?"#22c55e":"rgba(255,255,255,0.2)", flexShrink:0 }} />
                    <span style={{ fontWeight:700, fontSize:14, flex:1, color:"#fff" }}>{team.team_name}</span>
                    {cards.map((c,i) => (
                      <span key={i} style={{ fontSize:10, padding:"2px 6px", borderRadius:4, background:cardColor[c.card_type]+"33", color:cardColor[c.card_type], fontWeight:700 }}>{cardLabel[c.card_type]}</span>
                    ))}
                  </div>
                  {answered && <div style={{ fontSize:13, color:"#22c55e", paddingLeft:16, fontStyle:"italic" }}>{ans}</div>}
                  {!answered && phase==="question" && <div style={{ fontSize:12, color:"rgba(255,255,255,0.3)", paddingLeft:16 }}>Waiting...</div>}
                </div>
              );
            })}
          </div>

          <div style={{ padding:"16px 20px", flex:1 }}>
            <div style={{ fontSize:14, fontWeight:700, color:"#BE26C1", marginBottom:10, letterSpacing:2 }}>POWER CARDS PLAYED</div>
            {unoCards.length===0 && <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)" }}>None yet</div>}
            {unoCards.slice(0,10).map((c,i) => (
              <div key={c.id||i} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", borderRadius:8, background:"rgba(255,255,255,0.05)", marginBottom:6 }}>
                <span style={{ color:cardColor[c.card_type], fontWeight:700, fontSize:13, minWidth:50 }}>{cardLabel[c.card_type]}</span>
                <span style={{ color:"rgba(255,255,255,0.7)", fontSize:13 }}>{c.team_name}</span>
                <span style={{ color:"rgba(255,255,255,0.3)", fontSize:11, marginLeft:"auto" }}>{c.played_at?new Date(c.played_at).toLocaleTimeString():""}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
// deploy fix
