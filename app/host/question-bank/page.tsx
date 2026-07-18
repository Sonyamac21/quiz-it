"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { HostShell, HostButton, HostInput, HostLoading, Chip } from "@/components/fable/HostConsole";

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
const PAGE_SIZE = 20;
const selectStyle: React.CSSProperties = { minHeight: 56, padding: "0 14px", borderRadius: 12, background: "#150A2E", color: "#F4EFFF", border: "1px solid #4D3175", fontSize: 18, fontFamily: "'Inter',sans-serif", cursor: "pointer", outline: "none" };

export default function QuestionBankPage() {
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

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
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleQuestions = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <HostShell>
      <main className="qi-bo-page" style={{ minHeight: "100vh", background: STAGE_BG, color: "#fff" }}>
        <header className="qi-bo-pagehead">
          <div><p>Question inventory</p><h1>Question Library</h1><span>Find, review and place saved questions into reusable rounds.</span></div>
          <div className="qi-bo-page-actions"><Link className="fbh-btn" href="/host/rounds">Round Library</Link><Link className="fbh-btn pri" href="/host/questions">Generate Questions</Link></div>
        </header>

        <section className="qi-bo-library-summary" aria-label="Question library summary">
          <div><strong>{questions.length}</strong><span>Saved questions</span></div>
          <div><strong>{filtered.length}</strong><span>Matching this view</span></div>
          <div><strong>{rounds.length}</strong><span>Available rounds</span></div>
        </section>

        {status && <p style={{ textAlign: "center", color: "#D94FDC", font: "600 13px 'Inter'", marginBottom: 16 }}>{status}</p>}

        <HostInput
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search questions, topics or answers…"
          aria-label="Search saved questions"
          style={{ marginBottom: 14 }}
        />

        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {["all", "multiple_choice", "text_answer", "number", "sequence"].map(f => (
            <Chip key={f} on={filter === f} onClick={() => { setFilter(f); setPage(1); }}>{f === "all" ? "All questions" : typeLabel[f]}</Chip>
          ))}
        </div>

        {loading && <HostLoading title="Question Bank" note="Loading saved questions…" />}
        {!loading && filtered.length === 0 && (
          <p style={{ textAlign: "center", color: "#6B5A8E", font: "400 13px 'Inter'" }}>
            {search.trim().length >= 2 ? "No questions match your search." : "No questions in the bank yet."}
          </p>
        )}

        {visibleQuestions.map(q => (
          <div key={q.id} className="fbh-panel">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <span className="fbh-chip">{typeLabel[q.question_type] || q.question_type}</span>
              <span style={{ color: "#B9A8D9" }}>{q.difficulty}</span>
              <div style={{ flex: 1 }} />
              {rounds.length > 0 && (
                <select onChange={e => { if (e.target.value) { addToRound(q, e.target.value); } e.target.value = ""; }} style={selectStyle}>
                  <option value="">Add to round…</option>
                  {rounds.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
              <HostButton onClick={() => deleteQuestion(q.id)}>Delete</HostButton>
            </div>
            <p style={{ fontWeight: 650, fontSize: 20, marginBottom: 12, lineHeight: 1.5 }}>{q.question_text}</p>
            {q.question_type === "multiple_choice" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {(["a", "b", "c", "d"] as const).map(l => (
                  <div key={l} style={{ fontWeight: 600, fontSize: 18, padding: "12px 14px", borderRadius: 10, background: l === q.correct_answer ? "rgba(46,224,110,0.15)" : "#150A2E", color: l === q.correct_answer ? "#2EE06E" : "#B9A8D9", border: l === q.correct_answer ? "1px solid rgba(46,224,110,0.4)" : "1px solid #2E1A52" }}>
                    <span style={{ color: "#BE26C1", fontWeight: 700, marginRight: 6 }}>{l.toUpperCase()}.</span>{q[("option_" + l) as keyof BankQuestion] as string}
                  </div>
                ))}
              </div>
            )}
            {q.question_type === "sequence" && (
              <div>{[q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean).map((item, idx) => (
                <div key={idx} style={{ fontWeight: 600, fontSize: 18, padding: "12px 14px", marginBottom: 6, borderRadius: 10, background: "#150A2E", color: "#B9A8D9", display: "flex", gap: 8, border: "1px solid #2E1A52" }}>
                  <span style={{ color: "#BE26C1", fontWeight: 700, minWidth: 20 }}>{idx + 1}.</span>{item}
                </div>
              ))}</div>
            )}
            {(q.question_type === "text_answer" || q.question_type === "number") && (
              <div>
                {q.option_a && <p style={{ color: "#B9A8D9", margin: "0 0 6px", fontStyle: "italic" }}>{q.option_a}</p>}
                <p style={{ fontWeight: 650, fontSize: 18, color: "#2EE06E", margin: 0 }}>Answer: {q.correct_answer}</p>
              </div>
            )}
          </div>
        ))}
        {!loading && filtered.length > PAGE_SIZE && <nav className="qi-bo-pagination" aria-label="Question pages"><HostButton disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</HostButton><span>Page {page} of {pageCount}</span><HostButton disabled={page === pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>Next</HostButton></nav>}
      </main>
    </HostShell>
  );
}
