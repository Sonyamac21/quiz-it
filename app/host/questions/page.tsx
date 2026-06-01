"use client";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Question = {
  question_text: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_answer: string;
  difficulty: string;
  round_type: string;
  _approved?: boolean;
  _rejected?: boolean;
  _verified?: boolean;
  _verify_note?: string;
};

export default function QuestionsPage() {
  const [roundType, setRoundType] = useState("regular");
  const [difficulty, setDifficulty] = useState("medium");
  const [theme, setTheme] = useState("");
  const [count, setCount] = useState(5);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function callAPI(prompt: string) {
    const res = await fetch("/api/generate-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    const text = data.content.filter((b: {type:string}) => b.type === "text").map((b: {text:string}) => b.text).join("");
    return text.replace(/```json/g, "").replace(/```/g, "").trim();
  }

  async function generate() {
    setLoading(true);
    setStatus("Generating questions...");
    setQuestions([]);

    const seed = Math.floor(Math.random() * 999999); const topicBanks = ["world history,ancient civilisations,wars and politics","science,human body,space and astronomy","geography,capital cities,flags and countries","sport,olympics,world records","food and drink,cooking,famous chefs","literature,classic books,famous authors","art,music history,classical composers","nature,animals,biology","mathematics,inventions,famous scientists","religion,mythology,philosophy","language,words,etymology","architecture,engineering,famous landmarks"]; const randomTopics = topicBanks[Math.floor(Math.random() * topicBanks.length)]; const themeNote = theme ? "Topic: " + theme + "." : "Mix of fun general knowledge topics. Seed:" + seed + ". Focus on these topic areas this time: " + randomTopics + ". Be creative and unexpected - avoid obvious or overused quiz questions.";
    const prompt = "You are a professional pub quiz writer. Generate exactly " + count + " pub quiz questions for a " + roundType + " round. " + themeNote + " Difficulty: " + difficulty + ". Use a smart mix of these 4 types: multiple_choice (4 options, correct_answer is a/b/c/d), text_answer (short answer, options null), number (numeric answer, options null, hint in option_a), sequence (4 items in correct order in option_a/b/c/d, correct_answer=a,b,c,d). Return ONLY a valid JSON array no markdown: [{\"question_text\":\"...\",\"question_type\":\"...\",\"option_a\":\"...\",\"option_b\":\"...\",\"option_c\":\"...\",\"option_d\":\"...\",\"correct_answer\":\"...\",\"difficulty\":\"" + difficulty + "\",\"round_type\":\"" + roundType + "\"}]";

    try {
      const text = await callAPI(prompt);
      const qs: Question[] = JSON.parse(text);
      setQuestions(qs);
      setStatus(qs.length + " questions generated. Fact-checking...");
      setLoading(false);

      const checked = [...qs];
      for (let i = 0; i < qs.length; i++) {
        const q = qs[i];
        const detail = q.question_type === "multiple_choice"
          ? "A)" + q.option_a + " B)" + q.option_b + " C)" + q.option_c + " D)" + q.option_d + " Correct:" + q.correct_answer
          : q.question_type === "sequence"
          ? "Order: 1)" + q.option_a + " 2)" + q.option_b + " 3)" + q.option_c + " 4)" + q.option_d
          : "Answer: " + q.correct_answer;
        const factPrompt = "Fact-check this quiz question. Reply ONLY with JSON {\"ok\":true,\"note\":\"Verified\"} or {\"ok\":false,\"note\":\"reason\"} - Question: " + q.question_text + " " + detail;
        try {
          const vtext = await callAPI(factPrompt);
          const result = JSON.parse(vtext);
          checked[i] = { ...checked[i], _verified: result.ok, _verify_note: result.note };
        } catch {
          checked[i] = { ...checked[i], _verified: false, _verify_note: "Could not verify" };
        }
        setQuestions([...checked]);
      }
      const passed = checked.filter(q => q._verified).length;
      setStatus("Done! " + passed + " of " + qs.length + " passed fact-check. Approve the ones you want to save.");
    } catch (e) {
      setStatus("Error generating questions. Please try again.");
      setLoading(false);
    }
  }

  async function saveApproved() {
    const approved = questions.filter(q => q._approved && !q._rejected);
    if (!approved.length) { setStatus("Approve some questions first!"); return; }
    setSaving(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("questions").insert(approved.map(q => ({
      question_text: q.question_text,
      question_type: q.question_type,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      correct_answer: q.correct_answer,
      difficulty: q.difficulty,
      round_type: q.round_type,
      verified: q._verified ?? false,
    })));
    setSaving(false);
    if (error) { setStatus("Save failed: " + error.message); return; }
    setStatus("Saved " + approved.length + " questions!");
    setQuestions(prev => prev.filter(q => !q._approved));
  }

  const typeBg: Record<string,string> = { multiple_choice:"#e0f2fe", text_answer:"#ede9fe", number:"#fef3c7", sequence:"#fce7f3" };
  const typeColor: Record<string,string> = { multiple_choice:"#0c4a6e", text_answer:"#5b21b6", number:"#92400e", sequence:"#9d174d" };

  return (
    <div style={{ minHeight:"100vh", background:"#000", color:"#fff", padding:"24px", fontFamily:"sans-serif", maxWidth:"900px", margin:"0 auto" }}>
      <h1 style={{ color:"#BE26C1", fontSize:28, marginBottom:24 }}>Question Generator</h1>

      <div style={{ background:"#111", border:"1px solid #333", borderRadius:12, padding:20, marginBottom:20 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <div>
            <label style={{ fontSize:13, color:"#aaa", display:"block", marginBottom:6 }}>Round type</label>
            <select value={roundType} onChange={e => setRoundType(e.target.value)} style={{ width:"100%", padding:"8px 12px", borderRadius:8, background:"#222", color:"#fff", border:"1px solid #444" }}>
              <option value="regular">Regular round</option>
              <option value="bonus">Bonus / themed</option>
              <option value="music">Music round</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize:13, color:"#aaa", display:"block", marginBottom:6 }}>How many?</label>
            <select value={count} onChange={e => setCount(parseInt(e.target.value))} style={{ width:"100%", padding:"8px 12px", borderRadius:8, background:"#222", color:"#fff", border:"1px solid #444" }}>
              {[3,5,10,15].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:13, color:"#aaa", display:"block", marginBottom:8 }}>Difficulty</label>
          <div style={{ display:"flex", gap:8 }}>
            {["easy","medium","hard","mixed"].map(d => (
              <button key={d} onClick={() => setDifficulty(d)} style={{ padding:"6px 16px", borderRadius:999, border:"1px solid #444", background:difficulty===d?"#BE26C1":"transparent", color:"#fff", cursor:"pointer", fontSize:13 }}>{d}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:13, color:"#aaa", display:"block", marginBottom:6 }}>Theme / topic (optional)</label>
          <input value={theme} onChange={e => setTheme(e.target.value)} placeholder="e.g. 90s movies, science..." style={{ width:"100%", padding:"8px 12px", borderRadius:8, background:"#222", color:"#fff", border:"1px solid #444", boxSizing:"border-box" }} />
        </div>
        <button onClick={generate} disabled={loading} style={{ width:"100%", padding:12, borderRadius:8, background:"#BE26C1", color:"#fff", border:"none", fontSize:16, fontWeight:600, cursor:loading?"not-allowed":"pointer", opacity:loading?0.6:1 }}>
          {loading ? "Generating..." : "Generate questions"}
        </button>
      </div>

      {status && <p style={{ textAlign:"center", color:"#aaa", fontSize:14, marginBottom:16 }}>{status}</p>}

      {questions.filter(q => !q._rejected).map((q, i) => (
        <div key={i} style={{ background:"#111", border:"1px solid " + (q._approved?"#22c55e":q._verified===false?"#ef4444":q._verified?"#22c55e":"#333"), borderRadius:12, padding:16, marginBottom:12, opacity:q._approved?0.6:1 }}>
          <div style={{ fontSize:12, color:"#888", marginBottom:6 }}>
            {q.round_type} · {q.difficulty} · <span style={{ background:typeBg[q.question_type]||"#eee", color:typeColor[q.question_type]||"#333", padding:"2px 8px", borderRadius:999, fontSize:11 }}>{(q.question_type||"").replace("_"," ")}</span>
          </div>
          <p style={{ fontSize:15, fontWeight:600, marginBottom:10 }}>{q.question_text}</p>

          {q.question_type === "multiple_choice" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:10 }}>
              {["a","b","c","d"].map(l => (
                <div key={l} style={{ fontSize:13, padding:"4px 8px", borderRadius:6, background:l===q.correct_answer?"#dcfce7":"#1a1a1a", color:l===q.correct_answer?"#166534":"#aaa" }}>
                  {l.toUpperCase()}: {q[("option_"+l) as keyof Question] as string}
                </div>
              ))}
            </div>
          )}
          {q.question_type === "sequence" && (
            <div style={{ marginBottom:10 }}>
              {[q.option_a,q.option_b,q.option_c,q.option_d].filter(Boolean).map((item,idx) => (
                <div key={idx} style={{ fontSize:13, padding:"4px 8px", marginBottom:4, borderRadius:6, background:"#1a1a1a", color:"#aaa" }}>
                  <span style={{ color:"#BE26C1", fontWeight:600, marginRight:8 }}>{idx+1}.</span>{item}
                </div>
              ))}
            </div>
          )}
          {(q.question_type === "text_answer" || q.question_type === "number") && (
            <div style={{ marginBottom:10 }}>
              {q.option_a && <p style={{ fontSize:12, color:"#666", margin:"0 0 4px" }}>{q.option_a}</p>}
              <p style={{ fontSize:14, color:"#22c55e", fontWeight:600 }}>Answer: {q.correct_answer}</p>
            </div>
          )}

          {q._verified !== undefined
            ? <div style={{ fontSize:12, padding:"3px 8px", borderRadius:6, display:"inline-block", marginBottom:8, background:q._verified?"#dcfce7":"#fee2e2", color:q._verified?"#166534":"#991b1b" }}>{q._verified ? "✓ Verified" : "✗ " + q._verify_note}</div>
            : <div style={{ fontSize:12, color:"#666", marginBottom:8 }}>Checking...</div>
          }

          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => setQuestions(prev => prev.map((x,idx) => idx===i?{...x,_approved:true}:x))} style={{ padding:"5px 12px", borderRadius:6, border:"1px solid #444", background:"transparent", color:"#fff", cursor:"pointer", fontSize:12 }}>Approve</button>
            <button onClick={() => setQuestions(prev => prev.map((x,idx) => idx===i?{...x,_rejected:true}:x))} style={{ padding:"5px 12px", borderRadius:6, border:"1px solid #444", background:"transparent", color:"#fff", cursor:"pointer", fontSize:12 }}>Reject</button>
          </div>
        </div>
      ))}

      {questions.length > 0 && (
        <button onClick={saveApproved} disabled={saving} style={{ width:"100%", padding:12, borderRadius:8, background:"#16a34a", color:"#fff", border:"none", fontSize:16, fontWeight:600, cursor:"pointer", marginTop:8 }}>
          {saving ? "Saving..." : "Save approved questions"}
        </button>
      )}
    </div>
  );
}
