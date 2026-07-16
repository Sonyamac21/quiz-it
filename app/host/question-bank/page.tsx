"use client";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { HostShell, HostButton, HostInput, HostLoading, Chip, TopSpacer } from "@/components/fable/HostConsole";

const STAGE_BG = "radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118";

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

const typeLabel: Record<string,string> = { multiple_choice:"Multiple Choice", text_answer:"Text Answer", number:"Number", sequence:"Sequence" };
const selectStyle: React.CSSProperties = { padding: "6px 10px", borderRadius: 10, background: "#150A2E", color: "#D94FDC", border: "1px solid #2E1A52", fontSize: 11, fontFamily: "'Inter',sans-serif", cursor: "pointer", outline: "none" };

export default function QuestionBankPage() {
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const [{ data: qs }, { data: rs }] = await Promise.all([
        supabase.from("question_bank").select("*").order("created_at", { ascending: false }),
        supabase.from("rounds").select("id, name").order("created_at", { ascending: false }),
      ]);
      if (qs) setQuestions(qs);
      if (rs) setRounds(rs);
      setLoading(false);
    })();
  }, []);

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
    <HostShell>
      <div style={{ minHeight: "100vh", background: STAGE_BG, color: "#fff", padding: "24px", maxWidth: 980, margin: "0 auto" }}>
        {/* TOP BAR */}
        <div className="fbh-top" style={{ border: "1px solid #2E1A52", borderRadius: 16, marginBottom: 20 }}>
          <span className="fbh-wm" style={{ fontSize: 16 }}><span className="q">QUIZ-</span>IT</span>
          <span className="fbh-bc">Question Bank</span>
          <span style={{ font: "400 11px 'Inter'", color: "#6B5A8E" }}>{questions.length} saved</span>
          <TopSpacer />
          <a className="fbh-btn" href="/host/events">Events</a>
          <a className="fbh-btn" href="/host/rounds">Round Library</a>
        </div>

        {status && <p style={{ textAlign: "center", color: "#D94FDC", font: "600 13px 'Inter'", marginBottom: 16 }}>{status}</p>}

        <HostInput
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Type here to search (2 or more characters)…"
          style={{ marginBottom: 14 }}
        />

        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {["all", "multiple_choice", "text_answer", "number", "sequence"].map(f => (
            <Chip key={f} on={filter === f} onClick={() => setFilter(f)}>{f === "all" ? "All" : typeLabel[f]}</Chip>
          ))}
        </div>

        {loading && <HostLoading title="Question Bank" note="Loading saved questions…" />}
        {!loading && filtered.length === 0 && (
          <p style={{ textAlign: "center", color: "#6B5A8E", font: "400 13px 'Inter'" }}>
            {search.trim().length >= 2 ? "No questions match your search." : "No questions in the bank yet."}
          </p>
        )}

        {filtered.map(q => (
          <div key={q.id} className="fbh-panel">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <span className="fbh-chip">{typeLabel[q.question_type] || q.question_type}</span>
              <span style={{ font: "400 11px 'Inter'", color: "#6B5A8E" }}>{q.difficulty}</span>
              <div style={{ flex: 1 }} />
              {rounds.length > 0 && (
                <select onChange={e => { if (e.target.value) { addToRound(q, e.target.value); } e.target.value = ""; }} style={selectStyle}>
                  <option value="">Add to round…</option>
                  {rounds.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
              <HostButton onClick={() => deleteQuestion(q.id)} style={{ height: 30, padding: "0 12px" }}>Delete</HostButton>
            </div>
            <p style={{ font: "600 15px 'Inter'", marginBottom: 8, lineHeight: 1.5 }}>{q.question_text}</p>
            {q.question_type === "multiple_choice" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {(["a", "b", "c", "d"] as const).map(l => (
                  <div key={l} style={{ font: "600 13px 'Inter'", padding: "6px 10px", borderRadius: 8, background: l === q.correct_answer ? "rgba(46,224,110,0.15)" : "#150A2E", color: l === q.correct_answer ? "#2EE06E" : "#B9A8D9", border: l === q.correct_answer ? "1px solid rgba(46,224,110,0.4)" : "1px solid #2E1A52" }}>
                    <span style={{ color: "#BE26C1", fontWeight: 700, marginRight: 6 }}>{l.toUpperCase()}.</span>{q[("option_" + l) as keyof BankQuestion] as string}
                  </div>
                ))}
              </div>
            )}
            {q.question_type === "sequence" && (
              <div>{[q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean).map((item, idx) => (
                <div key={idx} style={{ font: "600 13px 'Inter'", padding: "6px 10px", marginBottom: 3, borderRadius: 8, background: "#150A2E", color: "#B9A8D9", display: "flex", gap: 8, border: "1px solid #2E1A52" }}>
                  <span style={{ color: "#BE26C1", fontWeight: 700, minWidth: 20 }}>{idx + 1}.</span>{item}
                </div>
              ))}</div>
            )}
            {(q.question_type === "text_answer" || q.question_type === "number") && (
              <div>
                {q.option_a && <p style={{ font: "400 12px 'Inter'", color: "#6B5A8E", margin: "0 0 4px", fontStyle: "italic" }}>{q.option_a}</p>}
                <p style={{ font: "600 14px 'Inter'", color: "#2EE06E", margin: 0 }}>Answer: {q.correct_answer}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </HostShell>
  );
}
