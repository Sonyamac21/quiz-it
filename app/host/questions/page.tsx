"use client";
import { useState, useRef, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Question = {
  question_text: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_answer: string;
  explanation: string;
  difficulty: string;
  round_type: string;
};

const TOPICS = ["world history","sport","food and drink","geography","science","music","film and TV","nature","language","UK and US pop culture","art","literature","technology","mathematics","famous people","transport","space","medicine","animals","architecture","inventions","TV shows","famous films","celebrity and entertainment","video games","fashion and style","world records","science fiction","comedy and humour","books and authors","classic cartoons"];
const typeBg: Record<string,string> = { multiple_choice:"#1e1040", text_answer:"#0f2a1a", number:"#2a1a00", sequence:"#1a002a", picture:"#0a1a2a", audio:"#1a0a00" };
const typeColor: Record<string,string> = { multiple_choice:"#a78bfa", text_answer:"#34d399", number:"#fbbf24", sequence:"#f472b6", picture:"#38bdf8", audio:"#fb923c" };
const typeLabel: Record<string,string> = { multiple_choice:"Multiple Choice", text_answer:"Text Answer", number:"Number", sequence:"Sequence", picture:"Picture Round", audio:"Name That Tune" };

export default function QuestionsPage() {
  const [roundType, setRoundType] = useState("regular");
  const [difficulty, setDifficulty] = useState("mixed");
  const [theme, setTheme] = useState("");
  const [count, setCount] = useState(15);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roundName, setRoundName] = useState("");
  const usedRef = useRef<string[]>([]);
  const dragIdx = useRef<number|null>(null);

  useEffect(() => { loadUsedQuestions(); }, []);

  async function loadUsedQuestions() {
    const supabase = createSupabaseBrowserClient();
    const [{ data: rounds }, { data: bank }] = await Promise.all([
      supabase.from("rounds").select("questions"),
      supabase.from("question_bank").select("question_text"),
    ]);
    const used: string[] = [];
    if (rounds) rounds.forEach((r: {questions: {question_text:string}[]}) => r.questions?.forEach((q) => used.push(q.question_text)));
    if (bank) bank.forEach((q: {question_text:string}) => used.push(q.question_text));
    usedRef.current = used;
  }

  async function callAPI(prompt: string) {
    const res = await fetch("/api/generate-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    const text = data.content.filter((b:{type:string}) => b.type==="text").map((b:{text:string}) => b.text).join("");
    return text.replace(/```json/g,"").replace(/```/g,"").trim();
  }

  async function checkQuestion(q: Question): Promise<{ok: boolean; note: string}> {
    const allText = [q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer].filter(Boolean).join(" ");
    const prompt = "You are a content moderator for a quiz night in Dubai, UAE. Check this question is safe for a mixed international audience. Reject if it contains: sexual references, crude body parts, alcohol, pork, drugs, religion, references to Iran or Israel, or anything offensive. Also verify the answer is factually correct. Reply ONLY with JSON {\"ok\":true,\"note\":\"OK\"} or {\"ok\":false,\"note\":\"reason\"}. Content: " + allText;
    try {
      const text = await callAPI(prompt);
      return JSON.parse(text);
    } catch {
      return { ok: false, note: "Could not verify" };
    }
  }

  async function generateOne(type: string, topic: string): Promise<Question|null> {
    const typeInstructions: Record<string,string> = {
      multiple_choice: "multiple_choice: 4 options A/B/C/D, correct_answer is a, b, c, or d",
      text_answer: "text_answer: short word or phrase answer, all options must be null",
      number: "number: numeric answer, options null except option_a which has a helpful hint e.g. \"To the nearest 10\"",
      sequence: "sequence: 4 items in correct order in option_a/b/c/d, correct_answer must be exactly \"a,b,c,d\"",
      picture: "picture: question_text must say \"Show teams this image:\" then describe what to search for (famous person, landmark, logo). option_a must be a short Google Images search query (3-5 words). option_b/c/d must be null. correct_answer is what teams write down.",
      audio: "audio: question_text must say \"Play this track:\" then the song name and artist. option_a must be a YouTube search query to find it (e.g. \"Bohemian Rhapsody Queen official\"). option_b/c/d must be null. correct_answer is what teams must write down.",
    };
    console.log("usedRef has", usedRef.current.length, "entries");
    const exclusions = usedRef.current.slice(-60).map((q,i) => (i+1)+". "+q).join("; ");
    const exclusionNote = exclusions ? " Do NOT generate any of these already-used questions: " + exclusions + "." : "";
    const prompt = "You are a professional pub quiz writer. Your audience is English-speaking expats who enjoy British and American pop culture. Generate exactly 1 pub quiz question. Topic: " + topic + ". Type: " + typeInstructions[type] + ". Difficulty: " + difficulty + ". Keep questions focused on UK, US and international culture. Do NOT make questions about UAE, Dubai or Arab culture unless the topic specifically requires it. Content must be safe for UAE - avoid alcohol, pork, sexual references, religion, and politically sensitive Middle East topics." + exclusionNote + " Include a brief explanation of the answer (1-2 sentences) in the explanation field. Return ONLY a valid JSON array with 1 item, no markdown: [{\"question_text\":\"...\",\"question_type\":\"" + type + "\",\"option_a\":\"...\",\"option_b\":\"...\",\"option_c\":\"...\",\"option_d\":\"...\",\"correct_answer\":\"...\",\"explanation\":\"...\",\"difficulty\":\"" + difficulty + "\",\"round_type\":\"" + roundType + "\"}]";
    try {
      const text = await callAPI(prompt);
      const q = JSON.parse(text)[0];
      if (q && q.question_type === "audio" && q.option_a) {
        try {
          const ytKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
          const ytRes = await fetch(
            "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=" +
            encodeURIComponent(q.option_a) + "&key=" + ytKey
          );
          const ytData = await ytRes.json();
          const videoId = ytData?.items?.[0]?.id?.videoId;
          if (videoId) q.option_b = "https://www.youtube.com/watch?v=" + videoId;
        } catch {}
      }
      return q;
    } catch {
      return null;
    }
  }

  async function generate() {
    setLoading(true);
    setQuestions([]);
    setRoundName("");
    let types: string[];
    if (roundType === "music") {
      types = Array(count).fill("audio");
    } else {
      const mcCount = Math.round(count * 0.30);
      const taCount = Math.round(count * 0.20);
      const numCount = Math.round(count * 0.15);
      const seqCount = Math.round(count * 0.15);
      const picCount = Math.round(count * 0.10);
      const audCount = count - mcCount - taCount - numCount - seqCount - picCount;
      types = [
        ...Array(mcCount).fill("multiple_choice"),
        ...Array(taCount).fill("text_answer"),
        ...Array(numCount).fill("number"),
        ...Array(seqCount).fill("sequence"),
        ...Array(Math.max(0,picCount)).fill("picture"),
        ...Array(Math.max(0,audCount)).fill("audio"),
      ].sort(() => Math.random() - 0.5);
    }
    const shuffledTopics = [...TOPICS].sort(() => Math.random() - 0.5);
    const good: Question[] = [];
    let attempts = 0;
    const maxAttempts = count * 8;
    let i = 0;
    while (good.length < count && attempts < maxAttempts) {
      const type = types[i % types.length];
      const topic = theme || shuffledTopics[(i + good.length) % shuffledTopics.length];
      setStatus("Generating question " + (good.length + 1) + " of " + count + "...");
      attempts++;
      const q = await generateOne(type, topic);
      if (!q) { i++; continue; }
      setStatus("Checking question " + (good.length + 1) + " of " + count + "...");
      const check = await checkQuestion(q);
      const isDuplicate = good.some(g => g.question_text.toLowerCase().trim() === q.question_text.toLowerCase().trim());
      if (check.ok && !isDuplicate) {
        good.push(q);
        usedRef.current = [...usedRef.current, q.question_text];
        setQuestions([...good]);
      } else {
        setStatus("Question " + (good.length + 1) + " failed check (" + check.note.substring(0,40) + ") - retrying...");
      }
      i++;
    }
    setLoading(false);
    if (good.length === count) {
      setStatus("Ready! Drag to reorder, then name and save your round.");
    } else {
      setStatus(good.length + " of " + count + " questions ready. Click Top Up to fill remaining slots.");
    }
  }

  async function removeAndReplace(i: number) {
    const removed = questions[i];
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.from("question_bank").insert({
        question_text: removed.question_text, question_type: removed.question_type,
        option_a: removed.option_a, option_b: removed.option_b,
        option_c: removed.option_c, option_d: removed.option_d,
        correct_answer: removed.correct_answer, difficulty: removed.difficulty,
        round_type: removed.round_type,
      });
    } catch(e) { console.log("Bank insert failed:", e); }
    usedRef.current = [...usedRef.current, removed.question_text];
    setQuestions(prev => prev.filter((_,idx) => idx !== i));
    setStatus("Finding replacement...");
    const topicList = [...TOPICS].sort(() => Math.random() - 0.5);
    let replaced = false;
    for (let attempt = 0; attempt < 10 && !replaced; attempt++) {
      const replaceTopic = theme || topicList[attempt % topicList.length];
      const newQ = await generateOne(removed.question_type, replaceTopic);
      if (!newQ) continue;
      const check = await checkQuestion(newQ);
      if (check.ok) {
        usedRef.current = [...usedRef.current, newQ.question_text];
        setQuestions(prev => [...prev, newQ]);
        setStatus("Replaced!");
        setTimeout(() => setStatus(""), 2000);
        replaced = true;
      }
    }
    if (!replaced) setStatus("Could not find replacement - try generating again.");
  }

  async function topUp() {
    const current = questions;
    const needed = count - current.length;
    if (needed <= 0) return;
    setStatus("Topping up " + needed + " question(s)...");
    const types = ["multiple_choice","text_answer","number","sequence"];
    const topicList = [...TOPICS].sort(() => Math.random() - 0.5);
    const added: Question[] = [];
    let attempts = 0;
    while (added.length < needed && attempts < needed * 6) {
      attempts++;
      const type = types[attempts % types.length];
      const topic = topicList[attempts % topicList.length];
      const q = await generateOne(type, topic);
      if (!q) continue;
      const check = await checkQuestion(q);
      if (check.ok) {
        usedRef.current = [...usedRef.current, q.question_text];
        added.push(q);
        setQuestions(prev => [...prev, q]);
      }
    }
    setStatus(added.length === needed ? "Ready! Drag to reorder, then name and save." : "Added " + added.length + " of " + needed + " needed.");
  }

  async function saveRound() {
    if (!roundName.trim()) { setStatus("Please enter a round name first!"); return; }
    if (questions.length === 0) { setStatus("No questions to save!"); return; }
    setSaving(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("rounds").insert({
      name: roundName.trim(), round_type: roundType, difficulty: difficulty, questions: questions,
    });
    setSaving(false);
    if (error) { setStatus("Save failed: " + error.message); return; }
    setStatus("Round saved!");
    setQuestions([]);
    setRoundName("");
    loadUsedQuestions();
  }

  const onDragStart = (i: number) => { dragIdx.current = i; };
  const onDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === i) return;
    const reordered = [...questions];
    const [moved] = reordered.splice(dragIdx.current, 1);
    reordered.splice(i, 0, moved);
    dragIdx.current = i;
    setQuestions(reordered);
  };
  const onDragEnd = () => { dragIdx.current = null; };

  return (
    <div style={{ minHeight:"100vh", background:"#07030f", color:"#fff", padding:"24px", fontFamily:"sans-serif", maxWidth:"960px", margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
        <div style={{ width:44, height:44, borderRadius:"50%", background:"#1a0530", border:"2px solid #BE26C1", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#BE26C1", fontWeight:700 }}>ME</div>
        <div>
          <div style={{ fontSize:22, fontWeight:700, color:"#BE26C1", letterSpacing:4 }}>Question Generator</div>
          <div style={{ fontSize:11, color:"rgba(190,38,193,0.6)", letterSpacing:2 }}>Quiz-It powered by Mac Entertainment</div>
        </div>
        <div style={{ flex:1 }} />
        <a href="/host/rounds" style={{ padding:"8px 16px", borderRadius:8, border:"1px solid rgba(190,38,193,0.4)", color:"#BE26C1", textDecoration:"none", fontSize:12, letterSpacing:2 }}>Round Library</a>
      </div>

      <div style={{ background:"#0d0520", border:"1px solid rgba(190,38,193,0.3)", borderRadius:12, padding:20, marginBottom:20 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
          <div>
            <label style={{ fontSize:11, letterSpacing:3, color:"rgba(190,38,193,0.6)", display:"block", marginBottom:6 }}>ROUND TYPE</label>
            <select value={roundType} onChange={e => setRoundType(e.target.value)} style={{ width:"100%", padding:"8px 12px", borderRadius:8, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.3)" }}>
              <option value="regular">Regular round</option>
              <option value="bonus">Bonus / themed</option>
              <option value="music">Music round</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize:11, letterSpacing:3, color:"rgba(190,38,193,0.6)", display:"block", marginBottom:6 }}>QUESTIONS</label>
            <select value={count} onChange={e => setCount(parseInt(e.target.value))} style={{ width:"100%", padding:"8px 12px", borderRadius:8, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.3)" }}>
              {[5,10,15].map(c => <option key={c} value={c}>{c} questions</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:11, letterSpacing:3, color:"rgba(190,38,193,0.6)", display:"block", marginBottom:6 }}>DIFFICULTY</label>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {["easy","medium","hard","mixed"].map(d => (
                <button key={d} onClick={() => setDifficulty(d)} style={{ padding:"6px 12px", borderRadius:999, border:"1px solid rgba(190,38,193,0.4)", background:difficulty===d?"#BE26C1":"transparent", color:"#fff", cursor:"pointer", fontSize:12 }}>{d}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:11, letterSpacing:3, color:"rgba(190,38,193,0.6)", display:"block", marginBottom:6 }}>THEME / TOPIC (optional)</label>
          <input value={theme} onChange={e => setTheme(e.target.value)} placeholder="e.g. 90s movies, space... leave blank for random variety" style={{ width:"100%", padding:"10px 16px", borderRadius:8, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.3)", boxSizing:"border-box" }} />
        </div>
        <button onClick={generate} disabled={loading} style={{ width:"100%", padding:14, borderRadius:8, background:loading?"#4a1060":"#BE26C1", color:"#fff", border:"none", fontSize:16, letterSpacing:4, cursor:loading?"not-allowed":"pointer", opacity:loading?0.7:1 }}>
          {loading ? "Generating..." : "Generate Round"}
        </button>
      </div>

      {status && <p style={{ textAlign:"center", color:"rgba(190,38,193,0.8)", fontSize:13, letterSpacing:2, marginBottom:16 }}>{status}</p>}

      {questions.length > 0 && (
        <>
          <div style={{ fontSize:12, color:"#666", textAlign:"center", marginBottom:12 }}>Drag to reorder · {questions.length} questions</div>
          {questions.map((q, i) => (
            <div key={i} draggable onDragStart={() => onDragStart(i)} onDragOver={e => onDragOver(e, i)} onDragEnd={onDragEnd}
              style={{ background:"#0d0520", border:"1px solid rgba(190,38,193,0.25)", borderRadius:12, padding:16, marginBottom:10, cursor:"grab", userSelect:"none" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, flexWrap:"wrap" }}>
                <span style={{ color:"#555", fontSize:13, fontWeight:700, minWidth:24 }}>{i+1}.</span>
                <span style={{ background:typeBg[q.question_type]||"#1a1a1a", color:typeColor[q.question_type]||"#aaa", padding:"3px 10px", borderRadius:999, fontSize:11, fontWeight:600 }}>
                  {typeLabel[q.question_type]||q.question_type}
                </span>
                <span style={{ fontSize:11, color:"#555" }}>{q.difficulty}</span>
                <div style={{ flex:1 }} />
                <button onClick={(e) => { e.stopPropagation(); removeAndReplace(i); }} onMouseDown={(e) => e.stopPropagation()} style={{ padding:"3px 10px", borderRadius:6, border:"1px solid #ef4444", background:"transparent", color:"#ef4444", cursor:"pointer", fontSize:11 }}>Remove</button>
              </div>
              <p style={{ fontSize:15, fontWeight:600, marginBottom:10, lineHeight:1.5 }}>{q.question_text}</p>
              {q.question_type==="multiple_choice" && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:8 }}>
                  {(["a","b","c","d"] as const).map(l => (
                    <div key={l} style={{ fontSize:13, padding:"5px 10px", borderRadius:6, background:l===q.correct_answer?"rgba(34,197,94,0.15)":"#0f0f1a", color:l===q.correct_answer?"#22c55e":"#aaa", border:"1px solid "+(l===q.correct_answer?"rgba(34,197,94,0.3)":"transparent") }}>
                      <span style={{ color:"#BE26C1", fontWeight:700, marginRight:6 }}>{l.toUpperCase()}.</span>{q[("option_"+l) as keyof Question] as string}
                    </div>
                  ))}
                </div>
              )}
              {q.question_type==="sequence" && (
                <div style={{ marginBottom:8 }}>
                  {[q.option_a,q.option_b,q.option_c,q.option_d].filter(Boolean).map((item,idx) => (
                    <div key={idx} style={{ fontSize:13, padding:"5px 10px", marginBottom:3, borderRadius:6, background:"#0f0f1a", color:"#ccc", display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ color:"#BE26C1", fontWeight:700, minWidth:20 }}>{idx+1}.</span>{item}
                    </div>
                  ))}
                </div>
              )}
              {(q.question_type==="text_answer"||q.question_type==="number") && (
                <div style={{ marginBottom:8 }}>
                  {q.option_a && <p style={{ fontSize:12, color:"#555", margin:"0 0 4px", fontStyle:"italic" }}>{q.option_a}</p>}
                  <p style={{ fontSize:14, color:"#22c55e", fontWeight:600, margin:0 }}>Answer: {q.correct_answer}</p>
                </div>
              )}
              {q.question_type==="picture" && (
                <div style={{ marginBottom:8 }}>
                  <a href={"https://www.google.com/search?tbm=isch&q="+encodeURIComponent(q.option_a||q.correct_answer)} target="_blank" rel="noopener noreferrer"
                    style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:8, background:"rgba(56,189,248,0.15)", border:"1px solid rgba(56,189,248,0.4)", color:"#38bdf8", textDecoration:"none", fontSize:13, fontWeight:600, marginBottom:8 }}>
                    Search Image
                  </a>
                  <p style={{ fontSize:14, color:"#22c55e", fontWeight:600, margin:"8px 0 0" }}>Answer: {q.correct_answer}</p>
                </div>
              )}
              {q.question_type==="audio" && (
                <div style={{ marginBottom:8 }}>
                  <a href={"https://www.youtube.com/results?search_query="+encodeURIComponent(q.option_a||q.correct_answer)} target="_blank" rel="noopener noreferrer"
                    style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:8, background:"rgba(251,146,60,0.15)", border:"1px solid rgba(251,146,60,0.4)", color:"#fb923c", textDecoration:"none", fontSize:13, fontWeight:600, marginBottom:8 }}>
                    Play on YouTube
                  </a>
                  <p style={{ fontSize:14, color:"#22c55e", fontWeight:600, margin:"8px 0 0" }}>Answer: {q.correct_answer}</p>
                </div>
              )}
              {q.explanation && (
                <div style={{ marginTop:8, padding:"8px 12px", borderRadius:8, background:"rgba(190,38,193,0.08)", borderLeft:"3px solid rgba(190,38,193,0.4)" }}>
                  <p style={{ fontSize:12, color:"rgba(190,38,193,0.8)", margin:0, lineHeight:1.5 }}>{q.explanation}</p>
                </div>
              )}
            </div>
          ))}

          <div style={{ background:"#0d0520", border:"1px solid rgba(190,38,193,0.3)", borderRadius:12, padding:20, marginTop:16 }}>
            {questions.length < count && (
              <button onClick={topUp} style={{ width:"100%", padding:10, borderRadius:8, background:"transparent", border:"1px solid #BE26C1", color:"#BE26C1", fontSize:13, letterSpacing:2, cursor:"pointer", marginBottom:12 }}>
                Top Up to {count} Questions ({count - questions.length} needed)
              </button>
            )}
            <label style={{ fontSize:11, letterSpacing:3, color:"rgba(190,38,193,0.6)", display:"block", marginBottom:8 }}>ROUND NAME</label>
            <input value={roundName} onChange={e => setRoundName(e.target.value)} placeholder="e.g. Round 1 - General Knowledge - 14 June" style={{ width:"100%", padding:"10px 16px", borderRadius:8, background:"#0f0f1a", color:"#fff", border:"1px solid rgba(190,38,193,0.3)", boxSizing:"border-box", marginBottom:12 }} />
            <button onClick={saveRound} disabled={saving||!roundName.trim()} style={{ width:"100%", padding:14, borderRadius:8, background:roundName.trim()?"#16a34a":"#1a1a1a", color:roundName.trim()?"#fff":"#444", border:"none", fontSize:16, letterSpacing:4, cursor:roundName.trim()?"pointer":"not-allowed" }}>
              {saving ? "Saving..." : "Save Round to Library"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
