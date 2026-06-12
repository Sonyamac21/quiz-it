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
  _checking?: boolean;
};

const TOPIC_BANKS = [
  "world history, ancient civilisations, wars and revolutions",
  "science, human body, space and astronomy",
  "geography, capital cities, flags and countries",
  "sport, olympics, world records, famous athletes",
  "food and drink, cooking, famous chefs, cuisines",
  "literature, classic books, famous authors, poetry",
  "art, music history, classical composers, famous paintings",
  "nature, animals, biology, ecosystems",
  "mathematics, inventions, famous scientists",
  "religion, mythology, philosophy, ancient cultures",
  "language, words, etymology, famous speeches",
  "architecture, engineering, famous landmarks, wonders",
  "film, television, theatre, famous directors",
  "technology, computing, internet, famous innovations",
  "fashion, design, pop culture, iconic moments",
];

export default function QuestionsPage() {
  const [roundType, setRoundType] = useState("regular");
  const [difficulty, setDifficulty] = useState("mixed");
  const [theme, setTheme] = useState("");
  const [count, setCount] = useState(15);
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
    const text = data.content
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");
    return text.replace(/```json/g, "").replace(/```/g, "").trim();
  }

  function buildPrompt(n: number, topicHint: string) {
    const mcCount = Math.round(n * 0.35);
    const taCount = Math.round(n * 0.25);
    const numCount = Math.round(n * 0.20);
    const seqCount = n - mcCount - taCount - numCount;
    const themeNote = theme
      ? "Topic: " + theme + ". All questions must be on this theme."
      : (() => { const t = ["world history","sport","food and drink","geography","science","music","film and TV","nature","language","pop culture","art","literature","technology","religion","mathematics"].sort(() => Math.random() - 0.5).slice(0, n); return "Assign each question a DIFFERENT topic in this exact order: " + t.map((x,i) => "Q"+(i+1)+":"+x).join(", ") + ". Every question must be on its assigned topic. Do not repeat topics."; })()
    return (
      "You are a professional pub quiz writer based in Dubai, UAE. All questions must be suitable for a mixed international audience in the UAE - avoid alcohol, pork, politically sensitive topics, and anything inappropriate for the region. Generate exactly " + n + " pub quiz questions for a " + n + " pub quiz qutions for a " +
      roundType + " round. " + themeNote + " Difficulty: " + difficulty + ". " +
      "Use EXACTLY this breakdown: " +
      mcCount + " multiple_choice (4 options, correct_answer is a/b/c/d), " +
      taCount + " text_answer (short answer, all options null), " +
      numCount + " number (numeric answer, options null, put a hint in option_a e.g. \"To the nearest 10\"), " +
      seqCount + " sequence (4 items in correct order in option_a/b/c/d, correct_answer must be exactly \"a,b,c,d\"). " +
      "Spread types throughout — do NOT group them together. " +
      "Return ONLY a valid JSON array, no markdown: " +
      "[{\"question_text\":\"...\",\"question_type\":\"...\",\"option_a\":\"...\",\"option_b\":\"...\",\"option_c\":\"...\",\"option_d\":\"...\",\"correct_answer\":\"...\",\"difficulty\":\"" + difficulty + "\",\"round_type\":\"" + roundType + "\"}]"
    );
  }

  async function factCheckOne(q: Question): Promise<Question> {
    const detail =
      q.question_type === "multiple_choice"
        ? "A)" + q.option_a + " B)" + q.option_b + " C)" + q.option_c + " D)" + q.option_d + " Correct:" + q.correct_answer
        : q.question_type === "sequence"
        ? "Correct ord: 1)" + q.option_a + " 2)" + q.option_b + " 3)" + q.option_c + " 4)" + q.option_d
        : "Answer: " + q.correct_answer;
    const factPrompt =
      "Fact-check this quiz question. Reply ONLY with JSON {\"ok\":true,\"note\":\"Verified\"} or {\"ok\":false,\"note\":\"reason\"} - Question: " +
      q.question_text + " " + detail;
    try {
      const vtext = await callAPI(factPrompt);
      const result = JSON.parse(vtext);
      return { ...q, _verified: result.ok, _verify_note: result.note, _checking: false };
    } catch {
      return { ...q, _verified: false, _verify_note: "Could not verify", _checking: false };
    }
  }

  async function generate() {
    setLoading(true);
    setStatus("Generating " + count + " questions...");
    setQuestions([]);
    const topics = TOPIC_BANKS[Math.floor(Math.random() * TOPIC_BANKS.length)];
    const prompt = buildPrompt(count, topics);
    try {
      const text = await callAPI(prompt);
      const qs: Question[] = JSON.parse(text).map((q: Question) => ({ ...q, _checking: true }));
      setQuestions(qs);
      setStatus(qs.length + " questions generated. Fact-checking...");
      setLoading(false);
      for (let i = 0; i < qs.length; i++) {
        const checked = await factCheckOne(qs[i]);
        setQuestions((prev) => prev.map((x, idx) => (idx === i ? checked : x)));
      }
      setStatus("Done! Review questions, then approve and save.");
    } catch {
      setStatus("Error generating questions. Please try again.");
      setLoading(false);
    }
  }

  async function regenerateOne(index: number) {
    const topics = TOPIC_BANKS[Math.floor(Math.random() * TOPIC_BANKS.length)];
    const q = questions[index];
    const prompt =
      "Generate exactly 1 pub quiz question. Type: " + q.question_type + ". " +
      "Topic: " + (theme || topics) + ". Difficulty: " + difficulty + ". " +
      "Return ONLY a valid JSON array with 1 item, no markdown: " +
      "[{\"question_text\":\"...\",\"question_type\":\"" + q.question_type + "\",\"option_a\":\"...\",\"option_b\":\"...\",\"option_c\":\"...\",\"option_d\":\"...\",\"correct_answer\":\"...\",\"difficulty\":\"" + difficulty + "\",\"round_type\":\"" + q.round_type + "\"}]";
    setQuestions((prev) => prev.map((x, idx) => (idx === index ? { ...x, _checking: true, _verified: undefined, _approved: false } : x)));
    try {
      const text = await callAPI(prompt);
      const newQ: Question = { ...JSON.parse(text)[0], _checking: true };
      setQuestions((prev) => prev.map((x, idx) => (idx === index ? newQ : x)));
      const checked = await factCheckOne(newQ);
      setQuestions((prev) => prev.map((x, idx) => (idx === index ? checked : x)));
    } catch {
      setQuestions((prev) => prev.map((x, idx) => idx === index ? { ...x, _checking: false, _verified: false, _verify_note: "Regeneration failed" } : x));
    }
  }

  function approveAll() {
    setQuestions((prev) => prev.map((q) => (!q._rejected && q._verified ? { ...q, _approved: true } : q)));
  }

  async function saveApproved() {
    const approved = questions.filter((q) => q._approved && !q._rejected);
    if (!approved.length) { setStatus("Approve some questions first!"); return; }
    setSaving(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("questions").insert(
      approved.map((q) => ({
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
      }))
    );
    setSaving(false);
    if (error) { setStatus("Save failed: " + error.message); return; }
    setStatus("Saved " + approved.length + " questions to Supabase!");
    setQuestions((prev) => prev.filter((q) => !q._approved));
  }

  const typeBg: Record<string, string> = { multiple_choice: "#1e1040", text_answer: "#0f2a1a", number: "#2a1a00", sequence: "#1a002a" };
  const typeColor: Record<string, string> = { multiple_choice: "#a78bfa", text_answer: "#34d399", number: "#fbbf24", sequence: "#f472b6" };
  const typeLabel: Record<string, string> = { multiple_choice: "Multiple Choice", text_answer: "Text Answer", number: "Number", sequence: "Sequence" };

  const visibleQs = questions.filter((q) => !q._rejected && q.question_text);
  const approvedCount = questions.filter((q) => q._approved && !q._rejected).length;
  const verifiedCount = questions.filter((q) => q._verified && !q._rejected).length;

  return (
    <div style={{ minHeight: "100vh", background: "#07030f", color: "#fff", padding: "24px", fontFamily: "sans-serif", maxWidth: "960px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#1a0530", border: "2px solid #BE26C1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#BE26C1", fontWeight: 700 }}>ME</div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#BE26C1", letterSpacing: 4 }}>Question Generator</div>
          <div style={{ fontSize: 11, color: "rgba(190,38,193,0.6)", letterSpacing: 2 }}>Quiz-It powered by Mac Entertainment</div>
        </div>
      </div>

      <div style={{ background: "#0d0520", border: "1px solid rgba(190,38,193,0.3)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, letterSpacing: 3, color: "rgba(190,38,193,0.6)", display: "block", marginBottom: 6 }}>ROUND TYPE</label>
            <select value={roundType} onChange={(e) => setRoundType(e.target.value)} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: "#0f0f1a", color: "#fff", border: "1px solid rgba(190,38,193,0.3)" }}>
              <option value="regular">Regular round</option>
              <option value="bonus">Bonus / themed</option>
              <option value="music">Music round</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, letterSpacing: 3, color: "rgba(190,38,193,0.6)", display: "block", marginBottom: 6 }}>QUESTIONS</label>
            <select value={count} onChange={(e) => setCount(parseInt(e.target.value))} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: "#0f0f1a", color: "#fff", border: "1px solid rgba(190,38,193,0.3)" }}>
              {[5, 10, 15].map((c) => <option key={c} value={c}>{c} questions</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, letterSpacing: 3, color: "rgba(190,38,193,0.6)", display: "block", marginBottom: 6 }}>DIFFICULTY</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["easy", "medium", "hard", "mixed"].map((d) => (
                <button key={d} onClick={() => setDifficulty(d)} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(190,38,193,0.4)", background: difficulty === d ? "#BE26C1" : "transparent", color: "#fff", cursor: "pointer", fontSize: 12 }}>{d}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, letterSpacing: 3, color: "rgba(190,38,193,0.6)", display: "block", marginBottom: 6 }}>THEME / TOPIC (optional)</label>
          <input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="e.g. 90s movies, Dubai, science... leave blank for random" style={{ width: "100%", padding: "10px 16px", borderRadius: 8, background: "#0f0f1a", color: "#fff", border: "1px solid rgba(190,38,193,0.3)", boxSizing: "border-box" }} />
        </div>
        <button onClick={generate} disabled={loading} style={{ width: "100%", padding: 14, borderRadius: 8, background: loading ? "#4a1060" : "#BE26C1", color: "#fff", border: "none", fontSize: 16, letterSpacing: 4, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Generating..." : "Generate Questions"}
        </button>
      </div>

      {status && <p style={{ textAlign: "center", color: "rgba(190,38,193,0.8)", fontSize: 13, letterSpacing: 2, marginBottom: 16 }}>{status}</p>}

      {visibleQs.length > 0 && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: "#666" }}>{verifiedCount} verified · {approvedCount} approved</div>
          <div style={{ flex: 1 }} />
          <button onClick={approveAll} style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #22c55e", background: "transparent", color: "#22c55e", cursor: "pointer", fontSize: 12, letterSpacing: 2 }}>Approve All Verified</button>
          <button onClick={saveApproved} disabled={saving || approvedCount === 0} style={{ padding: 8px 20px", borderRadius: 8, border: "none", background: approvedCount > 0 ? "#16a34a" : "#1a1a1a", color: approvedCount > 0 ? "#fff" : "#444", cursor: approvedCount > 0 ? "pointer" : "not-allowed", fontSize: 12, letterSpacing: 2 }}>
            {saving ? "Saving..." : "Save " + approvedCount + " to Supabase"}
          </button>
        </div>
      )}

      {visibleQs.map((q, i) => {
        const realIdx = questions.indexOf(q);
        return (
          <div key={i} style={{ background: "#0d0520", border: "1px solid " + (q._approved ? "#22c55e" : q._verified === false ? "#ef4444" : q._verified ? "rgba(34,197,94,0.4)" : "rgba(190,38,193,0.2)"), borderRadius: 12, padding: 16, marginBottom: 12, opacity: q._approved ? 0.65 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <span style={{ background: typeBg[q.question_type] || "#1a1a1a", color: typeColor[q.question_type] || "#aaa", padding: "3px 10px", borderRadius: 999, fontSize: 11, letterSpacing: 1, fontWeight: 600 }}>
                {typeLabel[q.question_type] || q.question_type}
              </span>
              <span style={{ fontSize: 11, color: "#555" }}>{q.difficulty} · {q.round_type}</span>
              <div style={{ flex: 1 }} />
              {q._checking && <span style={{ fontSize: 11, color: "#555" }}>checking...</span>}
              {!q._checking && q._verified !== undefined && (
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: q._verified ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: q._verified ? "#22c55e" : "#ef4444" }}>
                  {q._verified ? "Verified" : q._verify_note}
                </span>
              )}
            </div>

            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>{q.question_text}</p>

            {q.question_type === "multiple_choice" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginottom: 10 }}>
                {(["a", "b", "c", "d"] as const).map((l) => (
                  <div key={l} style={{ fontSize: 13, padding: "6px 10px", borderRadius: 6, background: l === q.correct_answer ? "rgba(34,197,94,0.15)" : "#0f0f1a", color: l === q.correct_answer ? "#22c55e" : "#aaa", border: "1px solid " + (l === q.correct_answer ? "rgba(34,197,94,0.3)" : "transparent") }}>
                    <span style={{ color: "#BE26C1", fontWeight: 700, marginRight: 6 }}>{l.toUpperCase()}.</span>
                    {q[("option_" + l) as keyof Question] as string}
                  </div>
                ))}
              </div>
            )}

            {q.question_type === "sequence" && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 6, letterSpacing: 1 }}>Correct order:</div>
                {[q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean).map((item, idx) => (
                  <div key={idx} style={{ fontSize: 13, padding: "6px 10px", marginBottom: 4, borderRadius: 6, background: "#0f0f1a", color: "#ccc", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#BE26C1", fontWeight: 700, minWidth: 20 }}>{idx + 1}.</span>{item}
                  </div>
                ))}
              </div>
            )}

            {(q.question_type === "text_answer" || q.question_type === "number") && (
              <div style={{ marginBottom: 10 }}>
                {q.option_a && <p style={{ fontSize: 12, color: "#555", margin: "0 0 6px", fontStyle: "italic" }}>{q.option_a}</p>}
                <p style={{ fontSize: 14, color: "#22c55e", fontWeight: 600, margin: 0 }}>Answer: {q.correct_answer}</p>
              </div>
            )}

            {!q._approved && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => setQuestions((prev) => prev.map((x, idx) => idx === realIdx ? { ...x, _approved: true } : x))} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #22c55e", background: "transparent", color: "#22c55e", cursor: "pointer", fontSize: 12 }}>Approve</button>
                <button onClick={() => regenerateOne(realIdx)} disabled={q._checking} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid rgba(190,38,193,0.5)", background: "transparent", color: "#BE26C1", cursor: q._checking ? "not-allowed" : "pointer", fontSize: 12 }}>Regenerate</button>
                <button onClick={() => setQuestions((prev) => prev.map((x, idx) => idx === realIdx ? { ...x, _rejected: true, _approved: false } : x))} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #333", background: "transparent", color: "#555", cursor: "pointer", fontSize: 12 }}>Reject</button>
              </div>
            )}
            {q._approved && <div style={{ fontSize: 12, color: "#22c55e", marginTop: 8 }}>Approved</div>}
          </div>
        );
      })}

      {visibleQs.length > 3 && (
        <div style={{ display: "flex", gap: 12, marginTop: 8, marginBottom: 32 }}>
          <button onClick={approveAll} style={{ flex: 1, padding: 12, borderRadius: 8, border: "1px solid #22c55e", background: "transparent", color: "#22c55e", cursor: "pointer", fontSize: 13, letterSpacing: 2 }}>Approve All Verified</button>
          <button onClick={saveApproved} disabled={saving || approvedCount === 0} style={{ flex: 1, padding: 12, borderRadius: 8, border: "none", background: approvedCount > 0 ? "#16a34a" : "#1a1a1a", color: approvedCount > 0 ? "#fff" : "#444", cursor: approvedCount > 0 ? "pointer" : "not-allowed", fontSize: 13, letterSpacing: 2 }}>
            {saving ? "Saving..." : "Save " + approvedCount + " to Supabase"}
          </button>
        </div>
      )}
    </div>
  );
}
