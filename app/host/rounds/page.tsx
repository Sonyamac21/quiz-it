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
  difficulty: string;
  round_type: string;
};

type Round = {
  id: string;
  name: string;
  round_type: string;
  difficulty: string;
  created_at: string;
  questions: Question[];
};

const typeBg: Record<string,string> = { multiple_choice:"#1e1040", text_answer:"#0f2a1a", number:"#2a1a00", sequence:"#1a002a" };
const typeColor: Record<string,string> = { multiple_choice:"#a78bfa", text_answer:"#34d399", number:"#fbbf24", sequence:"#f472b6" };
const typeLabel: Record<string,string> = { multiple_choice:"Multiple Choice", text_answer:"Text Answer", number:"Number", sequence:"Sequence" };

const ROUND_LAUNCHER_TYPES: { key: string; label: string; color: string; bg: string }[] = [
  { key: "regular",   label: "General Knowledge", color: "#3b82f6", bg: "rgba(59,130,246,0.16)" },
  { key: "bonus",     label: "Bonus / Themed",     color: "#a78bfa", bg: "rgba(167,139,250,0.16)" },
  { key: "music",     label: "Music",              color: "#fb923c", bg: "rgba(251,146,60,0.16)" },
  { key: "multi_tap", label: "Multi Tap",          color: "#22c55e", bg: "rgba(34,197,94,0.16)" },
];

export default function RoundsPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRound, setOpenRound] = useState<Round | null>(null);
  const [status, setStatus] = useState("");
  const [cardSelections, setCardSelections] = useState<Record<string,string>>({});

  useEffect(() => { loadRounds(); }, []);

  async function loadRounds() {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.from("rounds").select("*").order("created_at", { ascending: false });
    if (!error && data) setRounds(data);
    setLoading(false);
  }

  async function deleteRound(id: string) {
    if (!confirm("Delete this round?")) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("rounds").delete().eq("id", id);
    setRounds(prev => prev.filter(r => r.id !== id));
    if (openRound?.id === id) setOpenRound(null);
    setCardSelections(prev => {
      const next = { ...prev };
      for (const k of Object.keys(next)) if (next[k] === id) delete next[k];
      return next;
    });
  }

  async function duplicateRound(round: Round) {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.from("rounds").insert({
      name: round.name + " (Copy)",
      round_type: round.round_type,
      difficulty: round.difficulty,
      questions: round.questions,
    }).select().single();
    if (!error && data) {
      setRounds(prev => [data, ...prev]);
      setStatus("Round duplicated!");
      setTimeout(() => setStatus(""), 2000);
    }
  }

  async function sendToBank(roundId: string, qIdx: number) {
    if (!openRound) return;
    const q = openRound.questions[qIdx];
    const supabase = createSupabaseBrowserClient();
    await supabase.from("question_bank").insert({
      question_text: q.question_text, question_type: q.question_type,
      option_a: q.option_a, option_b: q.option_b,
      option_c: q.option_c, option_d: q.option_d,
      correct_answer: q.correct_answer, difficulty: q.difficulty, round_type: q.round_type,
    });
    const newQs = openRound.questions.filter((_, i) => i !== qIdx);
    const updated = { ...openRound, questions: newQs };
    await supabase.from("rounds").update({ questions: newQs }).eq("id", roundId);
    setOpenRound(updated);
    setRounds(prev => prev.map(r => r.id === roundId ? updated : r));
    setStatus("Question moved to bank!");
    setTimeout(() => setStatus(""), 2000);
  }

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg, #1a0535 0%, #0d0225 100%)", color:"#fff", padding:"24px", maxWidth:"960px", margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
        <div style={{ width:44, height:44, borderRadius:"50%", background:"#1a0530", border:"2px solid #BE26C1", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#BE26C1", fontWeight:700 }}>ME</div>
        <div>
          <div style={{ fontSize:22, fontWeight:700, color:"#BE26C1", letterSpacing:4 }}>Round Library</div>
          <div style={{ fontSize:11, color:"rgba(190,38,193,0.6)", letterSpacing:2 }}>Quiz-It · Powered by Mac Entertainment</div>
        </div>
        <div style={{ flex:1 }} />
        <a href="/host/music-prep" style={{ padding:"8px 16px", borderRadius:10, border:"1px solid rgba(251,146,60,0.4)", background:"rgba(251,146,60,0.06)", color:"#fb923c", textDecoration:"none", fontSize:12, fontWeight:600, letterSpacing:2, boxShadow:"0 2px 6px rgba(0,0,0,0.2)" }}>Music Prep</a>
        <a href="/host/question-bank" style={{ padding:"8px 16px", borderRadius:10, border:"1px solid rgba(190,38,193,0.4)", background:"rgba(190,38,193,0.06)", color:"#BE26C1", textDecoration:"none", fontSize:12, fontWeight:600, letterSpacing:2, boxShadow:"0 2px 6px rgba(0,0,0,0.2)" }}>Question Bank</a>
        <a href="/host/questions" style={{ padding:"8px 16px", borderRadius:10, background:"#BE26C1", color:"#fff", textDecoration:"none", fontSize:12, fontWeight:600, letterSpacing:2, boxShadow:"0 2px 8px rgba(0,0,0,0.3)" }}>+ New Round</a>
      </div>

      {status && <p style={{ textAlign:"center", color:"#22c55e", fontSize:13, marginBottom:16 }}>{status}</p>}
      {loading && <p style={{ textAlign:"center", color:"#666" }}>Loading rounds...</p>}
      {!loading && rounds.length === 0 && <p style={{ textAlign:"center", color:"#666" }}>No rounds saved yet. Generate your first round!</p>}

      {!openRound && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))", gap:16, marginBottom:24 }}>
          {ROUND_LAUNCHER_TYPES.map(rt => {
            const roundsOfType = rounds.filter(r => r.round_type === rt.key);
            const selectedId = cardSelections[rt.key] || "";
            const selectedRound = roundsOfType.find(r => r.id === selectedId) || null;
            return (
              <div key={rt.key} style={{ background: rt.bg, border: "2px solid " + rt.color, borderRadius: 16, padding: 16, boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.2)" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: rt.color, letterSpacing: 1, marginBottom: 10 }}>{rt.label}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <select
                    value={selectedId}
                    onChange={e => {
                      const id = e.target.value;
                      setCardSelections(prev => ({ ...prev, [rt.key]: id }));
                      const found = roundsOfType.find(r => r.id === id);
                      if (found) setOpenRound(found);
                    }}
                    style={{ flex: 1, padding: "8px 10px", borderRadius: 10, background: "#0f0f1a", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", fontSize: 13, minWidth: 0 }}
                  >
                    <option value="">-- select round --</option>
                    {roundsOfType.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.questions?.length || 0}q)</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedRound}
                    onClick={() => selectedRound && duplicateRound(selectedRound)}
                    title="Duplicate selected round"
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: selectedRound ? "#fff" : "rgba(255,255,255,0.3)", cursor: selectedRound ? "pointer" : "not-allowed", fontSize: 14, boxShadow: selectedRound ? "0 2px 6px rgba(0,0,0,0.2)" : "none" }}
                  >⧉</button>
                  <button
                    type="button"
                    disabled={!selectedRound}
                    onClick={() => selectedRound && deleteRound(selectedRound.id)}
                    title="Delete selected round"
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: selectedRound ? "#fff" : "rgba(255,255,255,0.3)", cursor: selectedRound ? "pointer" : "not-allowed", fontSize: 14, boxShadow: selectedRound ? "0 2px 6px rgba(0,0,0,0.2)" : "none" }}
                  >🗑</button>
                </div>
                {roundsOfType.length === 0 && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>No {rt.label.toLowerCase()} rounds saved yet</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!openRound && rounds.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: "rgba(190,38,193,0.6)", marginBottom: 10 }}>ALL ROUNDS</div>
          {rounds.map(r => (
            <div key={r.id} style={{ background:"linear-gradient(160deg, rgba(60,15,110,0.35), rgba(30,8,60,0.35))", border:"1px solid rgba(190,38,193,0.25)", borderRadius:14, padding:16, marginBottom:12, boxShadow:"inset 0 1px 1px rgba(255,255,255,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>{r.name}</div>
                  <div style={{ fontSize:12, color:"#666" }}>{r.questions?.length || 0} questions · {r.round_type} · {r.difficulty} · {new Date(r.created_at).toLocaleDateString()}</div>
                </div>
                <button onClick={() => setOpenRound(r)} style={{ padding:"8px 16px", borderRadius:10, border:"1px solid rgba(190,38,193,0.4)", background:"rgba(190,38,193,0.06)", color:"#BE26C1", cursor:"pointer", fontSize:12, fontWeight:600 }}>View</button>
                <button onClick={() => duplicateRound(r)} style={{ padding:"8px 16px", borderRadius:10, border:"1px solid #333", background:"transparent", color:"#aaa", cursor:"pointer", fontSize:12 }}>Duplicate</button>
                <button onClick={() => deleteRound(r.id)} style={{ padding:"8px 16px", borderRadius:10, border:"1px solid #333", background:"transparent", color:"#555", cursor:"pointer", fontSize:12 }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {openRound && (
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
            <button onClick={() => setOpenRound(null)} style={{ padding:"8px 16px", borderRadius:10, border:"1px solid #333", background:"rgba(255,255,255,0.04)", color:"#aaa", cursor:"pointer", fontSize:12 }}>Back</button>
            <div style={{ fontSize:18, fontWeight:700 }}>{openRound.name}</div>
            <div style={{ fontSize:12, color:"#666" }}>{openRound.questions.length} questions</div>
          </div>
          {openRound.questions.map((q, i) => (
            <div key={i} style={{ background:"linear-gradient(160deg, rgba(60,15,110,0.35), rgba(30,8,60,0.35))", border:"1px solid rgba(190,38,193,0.2)", borderRadius:14, padding:16, marginBottom:10, boxShadow:"inset 0 1px 1px rgba(255,255,255,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, flexWrap:"wrap" }}>
                <span style={{ color:"#555", fontSize:13, fontWeight:700 }}>{i+1}.</span>
                <span style={{ background:typeBg[q.question_type]||"#1a1a1a", color:typeColor[q.question_type]||"#aaa", padding:"3px 10px", borderRadius:999, fontSize:11, fontWeight:600 }}>{typeLabel[q.question_type]||q.question_type}</span>
                <span style={{ fontSize:11, color:"#555" }}>{q.difficulty}</span>
                <div style={{ flex:1 }} />
                <button onClick={() => sendToBank(openRound.id, i)} style={{ padding:"5px 12px", borderRadius:8, border:"1px solid rgba(190,38,193,0.4)", background:"transparent", color:"#BE26C1", cursor:"pointer", fontSize:11 }}>Move to Bank</button>
              </div>
              <p style={{ fontSize:15, fontWeight:600, marginBottom:8, lineHeight:1.5 }}>{q.question_text}</p>
              {q.question_type==="multiple_choice" && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                  {(["a","b","c","d"] as const).map(l => (
                    <div key={l} style={{ fontSize:13, padding:"5px 10px", borderRadius:8, background:l===q.correct_answer?"rgba(34,197,94,0.15)":"#0f0f1a", color:l===q.correct_answer?"#22c55e":"#aaa" }}>
                      <span style={{ color:"#BE26C1", fontWeight:700, marginRight:6 }}>{l.toUpperCase()}.</span>{(q as Record<string, string|null>)[("option_"+l)] as string}
                    </div>
                  ))}
                </div>
              )}
              {q.question_type==="sequence" && (
                <div>{[q.option_a,q.option_b,q.option_c,q.option_d].filter(Boolean).map((item,idx) => (
                  <div key={idx} style={{ fontSize:13, padding:"5px 10px", marginBottom:3, borderRadius:8, background:"#0f0f1a", color:"#ccc", display:"flex", gap:8 }}>
                    <span style={{ color:"#BE26C1", fontWeight:700, minWidth:20 }}>{idx+1}.</span>{item}
                  </div>
                ))}</div>
              )}
              {(q.question_type==="text_answer"||q.question_type==="number") && (
                <div>
                  {q.option_a && <p style={{ fontSize:12, color:"#555", margin:"0 0 4px", fontStyle:"italic" }}>{q.option_a}</p>}
                  <p style={{ fontSize:14, color:"#22c55e", fontWeight:600, margin:0 }}>Answer: {q.correct_answer}</p>
                </div>
              )}
              {q.explanation && (
                <div style={{ marginTop:8, padding:"8px 12px", borderRadius:10, background:"rgba(190,38,193,0.08)", borderLeft:"3px solid rgba(190,38,193,0.4)" }}>
                  <p style={{ fontSize:12, color:"rgba(190,38,193,0.8)", margin:0 }}>{q.explanation}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
