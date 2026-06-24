"use client";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type BankQuestion = {
  id: string;
  question_text: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_answer: string;
  difficulty: string;
  round_type: string;
  topic: string | null;
  created_at: string;
};

type Round = { id: string; name: string; };

const typeBg: Record<string,string> = { multiple_choice:"#1e1040", text_answer:"#0f2a1a", number:"#2a1a00", sequence:"#1a002a" };
const typeColor: Record<string,string> = { multiple_choice:"#a78bfa", text_answer:"#34d399", number:"#fbbf24", sequence:"#f472b6" };
const typeLabel: Record<string,string> = { multiple_choice:"Multiple Choice", text_answer:"Text Answer", number:"Number", sequence:"Sequence" };

export default function QuestionBankPage() {
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const supabase = createSupabaseBrowserClient();
    const [{ data: qs }, { data: rs }] = await Promise.all([
      supabase.from("question_bank").select("*").order("created_at", { ascending: false }),
      supabase.from("rounds").select("id, name").order("created_at", { ascending: false }),
    ]);
    if (qs) setQuestions(qs);
    if (rs) setRounds(rs);
    setLoading(false);
  }

  async function deleteQuestion(id: string) {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("question_bank").delete().eq("id", id);
    setQuestions(prev => prev.filter(q => q.id !== id));
  }

  async function addToRound(q: BankQuestion, roundId: string) {
    const supabase = createSupabaseBrowserClient();
    const { data: round } = await supabase.from("rounds").select("questions").eq("id", roundId).single();
    if (!round) return;
    const newQs = [...(round.questions || []), {
      question_text: q.question_text, question_type: q.question_type,
      option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d,
      correct_answer: q.correct_answer, difficulty: q.difficulty, round_type: q.round_type,
    }];
    await supabase.from("rounds").update({ questions: newQs }).eq("id", roundId);
    await supabase.from("question_bank").delete().eq("id", q.id);
    setQuestions(prev => prev.filter(x => x.id !== q.id));
    setStatus("Question added to round!");
    setTimeout(() => setStatus(""), 2000);
  }

  const byType = filter === "all" ? questions : questions.filter(q => q.question_type === filter);
  const filtered = search.trim().length < 2 ? byType : byType.filter(q => {
    const haystack = (q.question_text + " " + (q.topic || "") + " " + q.correct_answer).toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  return (
    <div style={{ minHeight:"100vh", background:"#07030f", color:"#fff", padding:"24px", fontFamily:"sans-serif", maxWidth:"960px", margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
        <div style={{ width:44, height:44, borderRadius:"50%", background:"#1a0530", border:"2px solid #BE26C1", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#BE26C1", fontWeight:700 }}>ME</div>
        <div>
          <div style={{ fontSize:22, fontWeight:700, color:"#BE26C1", letterSpacing:4 }}>Question Bank</div>
          <div style={{ fontSize:11, color:"rgba(190,38,193,0.6)", letterSpacing:2 }}>{questions.length} questions saved</div>
        </div>
        <div style={{ flex:1 }} />
        <a href="/host/rounds" style={{ padding:"8px 16px", borderRadius:8, border:"1px solid rgba(190,38,193,0.4)", color:"#BE26C1", textDecoration:"none", fontSize:12, letterSpacing:2 }}>Round Library</a>
      </div>

      {status && <p style={{ textAlign:"center", color:"#22c55e", fontSize:13, marginBottom:16 }}>{status}</p>}

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Type here to search (2 or more characters)..."
        style={{ width:"100%", padding:"12px 16px", borderRadius:10, background:"#0d0520", border:"1px solid rgba(190,38,193,0.3)", color:"#fff", fontSize:14, marginBottom:14, boxSizing:"border-box" as const }}
      />

      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
        {["all","multiple_choice","text_answer","number","sequence"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding:"6px 14px", borderRadius:999, border:"1px solid rgba(190,38,193,0.3)", background:filter===f?"#BE26C1":"transparent", color:"#fff", cursor:"pointer", fontSize:12 }}>
            {f === "all" ? "All" : typeLabel[f]}
          </button>
        ))}
      </div>

      {loading && <p style={{ textAlign:"center", color:"#666" }}>Loading...</p>}
      {!loading && filtered.length === 0 && (
        <p style={{ textAlign:"center", color:"#666" }}>
          {search.trim().length >= 2 ? "No questions match your search." : "No questions in the bank yet."}
        </p>
      )}

      {filtered.map(q => (
        <div key={q.id} style={{ background:"#0d0520", border:"1px solid rgba(190,38,193,0.2)", borderRadius:12, padding:16, marginBottom:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, flexWrap:"wrap" }}>
            <span style={{ background:typeBg[q.question_type]||"#1a1a1a", color:typeColor[q.question_type]||"#aaa", padding:"3px 10px", borderRadius:999, fontSize:11, fontWeight:600 }}>{typeLabel[q.question_type]||q.question_type}</span>
            <span style={{ fontSize:11, color:"#555" }}>{q.difficulty}</span>
            <div style={{ flex:1 }} />
            {rounds.length > 0 && (
              <select onChange={e => { if(e.target.value) { addToRound(q, e.target.value); } e.target.value=""; }}
                style={{ padding:"5px 10px", borderRadius:6, background:"#0f0f1a", color:"#BE26C1", border:"1px solid rgba(190,38,193,0.3)", fontSize:11, cursor:"pointer" }}>
                <option value="">Add to round...</option>
                {rounds.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
            <button onClick={() => deleteQuestion(q.id)} style={{ padding:"5px 10px", borderRadius:6, border:"1px solid #333", background:"transparent", color:"#555", cursor:"pointer", fontSize:11 }}>Delete</button>
          </div>
          <p style={{ fontSize:15, fontWeight:600, marginBottom:8, lineHeight:1.5 }}>{q.question_text}</p>
          {q.question_type==="multiple_choice" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
              {(["a","b","c","d"] as const).map(l => (
                <div key={l} style={{ fontSize:13, padding:"5px 10px", borderRadius:6, background:l===q.correct_answer?"rgba(34,197,94,0.15)":"#0f0f1a", color:l===q.correct_answer?"#22c55e":"#aaa" }}>
                  <span style={{ color:"#BE26C1", fontWeight:700, marginRight:6 }}>{l.toUpperCase()}.</span>{q[("option_"+l) as keyof BankQuestion] as string}
                </div>
              ))}
            </div>
          )}
          {q.question_type==="sequence" && (
            <div>{[q.option_a,q.option_b,q.option_c,q.option_d].filter(Boolean).map((item,idx) => (
              <div key={idx} style={{ fontSize:13, padding:"5px 10px", marginBottom:3, borderRadius:6, background:"#0f0f1a", color:"#ccc", display:"flex", gap:8 }}>
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
        </div>
      ))}
    </div>
  );
}
