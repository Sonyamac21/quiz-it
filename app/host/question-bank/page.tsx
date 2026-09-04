"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { HostShell, HostButton, HostInput, HostLoading, Chip } from "@/components/fable/HostConsole";
import { useConfirmDialog, usePromptDialog } from "@/components/ui/quiz-it-ui";
import { getMediaUrl } from "@/lib/getMediaUrl";

const STAGE_BG = "radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118";

type BankQuestion = {
  id: string;
  question_text: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  option_e: string | null;
  option_f: string | null;
  correct_answer: string;
  difficulty: string;
  round_type: string;
  topic: string | null;
  created_at: string;
};

type RoundTarget = { id: string; name: string; round_type: string; questions: BankQuestion[]; table: "rounds" | "quiz_rounds"; quizName?: string };

const typeLabel: Record<string,string> = { multiple_choice:"Multiple Choice", multi_tap:"Multi Tap", text_answer:"Text Answer", number:"Number", sequence:"Sequence", picture:"Picture", audio:"Music" };
const PAGE_SIZE = 20;
const selectStyle: React.CSSProperties = { height: 32, minWidth: 148, padding: "0 9px", borderRadius: 8, background: "#150A2E", color: "#F4EFFF", border: "1px solid #4D3175", fontSize: 11, fontFamily: "'Inter',sans-serif", cursor: "pointer", outline: "none" };
const questionKey = (question: { question_text?: unknown; correct_answer?: unknown }) => {
  const normalise = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `${normalise(question.question_text)}|${normalise(question.correct_answer)}`;
};

export default function QuestionBankPage() {
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirmDialog();
  const { promptDialog, dialog: promptDialogEl } = usePromptDialog();
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [rounds, setRounds] = useState<RoundTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  type RoundWithQuestions = { id: string; name: string; questions: BankQuestion[] };
  type Mismatch = { roundId: string; roundName: string; index: number; question_text: string; correct_answer: string };
  const [fullRounds, setFullRounds] = useState<RoundWithQuestions[]>([]);
  const [showTypeFixer, setShowTypeFixer] = useState(false);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [buildRoundType, setBuildRoundType] = useState("regular");
  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const [{ data: qs }, { data: rs }, { data: plans }] = await Promise.all([
        supabase.from("question_bank").select("*").order("created_at", { ascending: false }),
        supabase.from("rounds").select("id, name, round_type, questions").order("created_at", { ascending: false }),
        supabase.from("quizzes").select("id,name,quiz_rounds(id,name,round_type,questions,position)").eq("archived", false).order("updated_at", { ascending: false }),
      ]);
      if (qs) setQuestions(qs);
      const reusable = (rs || []).map(round => ({ ...round, questions: (round.questions || []) as BankQuestion[], table: "rounds" as const }));
      const planRounds = (plans || []).flatMap(plan => ((plan.quiz_rounds || []) as { id: string; name: string; round_type: string; questions: BankQuestion[]; position: number }[]).sort((a, b) => a.position - b.position).map(round => ({ id: round.id, name: round.name, round_type: round.round_type, questions: round.questions || [], table: "quiz_rounds" as const, quizName: plan.name })));
      setRounds([...planRounds, ...reusable]);
      if (rs) setFullRounds(rs as RoundWithQuestions[]);
      setLoading(false);
    })();
  }, []);
  const numberTypeMismatches: Mismatch[] = fullRounds.flatMap(r =>
    (r.questions || []).map((q, index) => ({ q, index })).filter(({ q }) =>
      q.question_type !== "number" && /^-?\d+$/.test((q.correct_answer || "").trim())
    ).map(({ q, index }) => ({ roundId: r.id, roundName: r.name, index, question_text: q.question_text, correct_answer: q.correct_answer }))
  );
  async function fixToNumberType(roundId: string, index: number) {
    const round = fullRounds.find(r => r.id === roundId);
    if (!round) return;
    const newQuestions = round.questions.map((q, i) => i === index ? { ...q, question_type: "number", option_a: null, option_b: null, option_c: null, option_d: null } : q);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("rounds").update({ questions: newQuestions }).eq("id", roundId);
    if (!error) {
      setFullRounds(prev => prev.map(r => r.id === roundId ? { ...r, questions: newQuestions } : r));
      setStatus("Fixed - now uses the number keypad.");
      setTimeout(() => setStatus(""), 2000);
    }
  }

  async function deleteQuestion(id: string) {
    const question = questions.find(item => item.id === id);
    if (!await confirmDialog(`Delete “${question?.question_text || "this question"}” from the Question Library? Questions already copied into rounds will not be affected.`, { title: "Delete library question?", tone: "destructive", confirmLabel: "Delete question" })) return;
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("question_bank").delete().eq("id", id);
    if (error) { setStatus("Could not delete question: " + error.message); return; }
    setQuestions(prev => prev.filter(q => q.id !== id));
  }

  async function addToRound(q: BankQuestion, targetKey: string) {
    const [table, roundId] = targetKey.split(":") as ["rounds" | "quiz_rounds", string];
    const target = rounds.find(round => round.table === table && round.id === roundId);
    if (!target) { setStatus("Could not find that round."); return; }
    if (target.round_type === "multi_tap" && q.question_type !== "multi_tap") { setStatus("Only Multi Tap questions can be added to a Multi Tap round."); return; }
    if (target.round_type === "music" && q.question_type !== "audio") { setStatus("Only music questions can be added to a Music round."); return; }
    if (target.round_type === "hot_seat" && target.questions.length >= 5) { setStatus("That Hot Seat round already has its required 5 questions."); return; }
    if (target.round_type === "pursuit" && target.questions.length >= 7) { setStatus("That Pursuit round already has its required 7 questions."); return; }
    const supabase = createSupabaseBrowserClient();
    const { data: round, error: readError } = await supabase.from(table).select("questions").eq("id", roundId).single();
    if (readError || !round) { setStatus("Could not open that round."); return; }
    const currentQuestions = (round.questions || []) as BankQuestion[];
    if (currentQuestions.some(question => questionKey(question) === questionKey(q))) { setStatus("That question is already in this round."); return; }
    const newQs = [...(round.questions || []), {
      question_text: q.question_text, question_type: q.question_type,
      option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d, option_e: q.option_e, option_f: q.option_f,
      correct_answer: q.correct_answer, difficulty: q.difficulty, round_type: q.round_type,
    }];
    const { data: saved, error: saveError } = await supabase.from(table).update({ questions: newQs }).eq("id", roundId).select("questions").single();
    if (saveError) { setStatus("Question was not added: " + saveError.message); return; }
    const persistedQuestions = (saved?.questions || []) as BankQuestion[];
    setRounds(prev => prev.map(item => item.id === roundId && item.table === table ? { ...item, questions: persistedQuestions } : item));
    setFullRounds(prev => prev.map(item => item.id === roundId ? { ...item, questions: persistedQuestions } : item));
    setStatus(`Question added. Round now has ${persistedQuestions.length}.`);
    setTimeout(() => setStatus(""), 2000);
  }

  async function buildRoundFromSelection() {
    const selectedQuestions = selectedQuestionIds.map(id => questions.find(question => question.id === id)).filter((question): question is BankQuestion => Boolean(question));
    if (!selectedQuestions.length) { setStatus("Select at least one question first."); return; }
    if (buildRoundType === "multi_tap" && selectedQuestions.some(question => question.question_type !== "multi_tap")) { setStatus("A Multi Tap round can only contain Multi Tap questions."); return; }
    if (buildRoundType === "music" && selectedQuestions.some(question => question.question_type !== "audio")) { setStatus("A Music round can only contain prepared music questions."); return; }
    if (buildRoundType === "hot_seat" && selectedQuestions.length !== 5) { setStatus("A Hot Seat round must contain exactly 5 questions."); return; }
    if (buildRoundType === "pursuit" && selectedQuestions.length !== 7) { setStatus("A Pursuit round must contain exactly 7 questions."); return; }
    const name = await promptDialog("Name this new reusable round.", `New ${buildRoundType === "regular" ? "General Knowledge" : typeLabel[buildRoundType] || buildRoundType} Round`, { title: "Build a round", confirmLabel: "Create round", placeholder: "Round name" });
    if (!name?.trim()) return;
    const supabase = createSupabaseBrowserClient();
    const payload = selectedQuestions.map(({ id: _id, created_at: _createdAt, topic: _topic, ...question }) => question);
    const { data, error } = await supabase.from("rounds").insert({ name: name.trim(), round_type: buildRoundType, difficulty: "mixed", questions: payload, hide_leaderboard: false, allow_power_cards: true, points_per_question: null }).select("id,name,questions").single();
    if (error || !data) { setStatus("Round was not created: " + (error?.message || "Unknown error")); return; }
    setRounds(prev => [...prev, { id: data.id, name: data.name, round_type: buildRoundType, questions: (data.questions || []) as BankQuestion[], table: "rounds" }]);
    setFullRounds(prev => [...prev, { id: data.id, name: data.name, questions: (data.questions || []) as BankQuestion[] }]);
    setSelectedQuestionIds([]);
    setStatus(`Created “${data.name}” with ${selectedQuestions.length} question${selectedQuestions.length === 1 ? "" : "s"}.`);
  }

  const byType = filter === "all" ? questions : questions.filter(q => q.question_type === filter);
  const filtered = search.trim().length < 2 ? byType : byType.filter(q => {
    const haystack = (q.question_text + " " + (q.topic || "") + " " + q.correct_answer).toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleQuestions = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const roundUnavailableReason = (round: RoundTarget, question: BankQuestion): string => {
    if (round.questions.some(existing => questionKey(existing) === questionKey(question))) return "already added";
    if (round.round_type === "multi_tap" && question.question_type !== "multi_tap") return "Multi Tap questions only";
    if (round.round_type === "music" && question.question_type !== "audio") return "music questions only";
    if (round.round_type === "hot_seat" && round.questions.length >= 5) return "full (5 questions)";
    if (round.round_type === "pursuit" && round.questions.length >= 7) return "full (7 questions)";
    return "";
  };

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
        {numberTypeMismatches.length > 0 && (
          <div className="fbh-panel" style={{ marginBottom: 20, border: "1px solid rgba(250,204,21,0.4)", background: "rgba(250,204,21,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setShowTypeFixer(v => !v)}>
              <strong style={{ color: "#facc15" }}>{"\u26A0"} {numberTypeMismatches.length} question{numberTypeMismatches.length === 1 ? "" : "s"} may show the wrong keyboard to players</strong>
              <span style={{ font: "600 12px 'Inter'", color: "#facc15" }}>{showTypeFixer ? "Hide" : "Review"}</span>
            </div>
            {showTypeFixer && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ font: "400 12px 'Inter'", color: "#B9A8D9" }}>These have a purely numeric answer (like a year) but are not saved as a Number question, so players get the letter keyboard instead of the number pad. Fixing one applies instantly - it does not need regenerating.</div>
                {numberTypeMismatches.map(m => (
                  <div key={m.roundId + "-" + m.index} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ font: "600 13px 'Inter'", color: "#fff" }}>{m.question_text}</div>
                      <div style={{ font: "400 11px 'Inter'", color: "#6B5A8E" }}>{m.roundName} - Answer: {m.correct_answer}</div>
                    </div>
                    <HostButton onClick={() => fixToNumberType(m.roundId, m.index)} style={{ height: 32, padding: "0 12px" }}>Fix to Number</HostButton>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <HostInput
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search questions, topics or answers…"
          aria-label="Search saved questions"
          style={{ marginBottom: 14 }}
        />

        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {["all", "multiple_choice", "multi_tap", "text_answer", "number", "sequence", "picture", "audio"].map(f => (
            <Chip key={f} on={filter === f} onClick={() => { setFilter(f); setPage(1); }}>{f === "all" ? "All questions" : typeLabel[f]}</Chip>
          ))}
        </div>

        <section className="fbh-panel" style={{ marginBottom: 18, padding: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }} aria-label="Build a round from selected questions">
          <div style={{ minWidth: 180, flex: 1 }}><strong style={{ display: "block", font: "700 14px 'Inter'" }}>Build a round</strong><span style={{ color: "#B9A8D9", font: "400 11px 'Inter'" }}>{selectedQuestionIds.length ? `${selectedQuestionIds.length} question${selectedQuestionIds.length === 1 ? "" : "s"} selected` : "Select question cards below"}</span></div>
          <select value={buildRoundType} onChange={event => setBuildRoundType(event.target.value)} aria-label="New round type" style={selectStyle}>
            <option value="regular">General Knowledge</option><option value="bonus">Bonus / Themed</option><option value="music">Music</option><option value="multi_tap">Multi Tap</option><option value="pursuit">The Pursuit</option><option value="hot_seat">Hot Seat</option>
          </select>
          <HostButton onClick={buildRoundFromSelection} disabled={!selectedQuestionIds.length} style={{ height: 34, padding: "0 12px", fontSize: 11 }}>CREATE ROUND</HostButton>
          {selectedQuestionIds.length > 0 && <HostButton onClick={() => setSelectedQuestionIds([])} style={{ height: 34, padding: "0 10px", fontSize: 11 }}>Clear</HostButton>}
        </section>

        {loading && <HostLoading title="Question Bank" note="Loading saved questions…" />}
        {!loading && filtered.length === 0 && (
          <p style={{ textAlign: "center", color: "#6B5A8E", font: "400 13px 'Inter'" }}>
            {search.trim().length >= 2 ? "No questions match your search." : "No questions in the bank yet."}
          </p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 12, alignItems: "start" }}>
        {visibleQuestions.map(q => {
          const optionLetters = q.question_type === "multi_tap" ? ["a", "b", "c", "d", "e", "f"] : ["a", "b", "c", "d"];
          const correctLetters = q.correct_answer.toLowerCase().split(",").map(value => value.trim());
          const isPicture = q.question_type === "picture";
          const isAudio = q.question_type === "audio";
          return (
          <article key={q.id} className="fbh-panel" style={{ margin: 0, padding: 14, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", color: selectedQuestionIds.includes(q.id) ? "#2EE06E" : "#B9A8D9", font: "600 11px 'Inter'" }}><input type="checkbox" checked={selectedQuestionIds.includes(q.id)} onChange={event => setSelectedQuestionIds(prev => event.target.checked ? [...prev, q.id] : prev.filter(id => id !== q.id))} /> Select</label>
              <span className="fbh-chip">{typeLabel[q.question_type] || q.question_type}</span>
              <span style={{ color: "#B9A8D9", font: "500 11px 'Inter'" }}>{q.difficulty}</span>
              <div style={{ flex: 1 }} />
            </div>
            <p style={{ font: "500 13px/1.45 'Inter'", color: "#D9CCF2", margin: "0 0 8px" }}>{q.question_text}</p>
            {isPicture && q.option_b && <img src={getMediaUrl(q.option_b) ?? undefined} alt={q.option_a || "Question picture"} style={{ display: "block", width: "100%", height: 118, objectFit: "cover", borderRadius: 7, marginBottom: 7 }} />}
            {isAudio && q.option_a && <div style={{ padding: "6px 8px", borderRadius: 7, background: "rgba(190,38,193,0.12)", border: "1px solid rgba(190,38,193,0.35)", color: "#D9CCF2", font: "500 11px/1.35 'Inter'", marginBottom: 7 }}><strong style={{ color: "#D94FDC" }}>TRACK:</strong> {q.option_a}</div>}
            {(q.question_type === "multiple_choice" || q.question_type === "multi_tap") && (
              <div style={{ display: "grid", gap: 3 }}>
                {optionLetters.map(l => {
                  const option = q[("option_" + l) as keyof BankQuestion] as string | null;
                  if (!option) return null;
                  const correct = correctLetters.includes(l);
                  return <div key={l} style={{ font: "400 12px/1.35 'Inter'", padding: "3px 5px", borderRadius: 6, background: correct ? "rgba(46,224,110,0.1)" : "transparent", color: correct ? "#2EE06E" : "#B9A8D9" }}>
                    <span style={{ color: correct ? "#2EE06E" : "#6B5A8E", fontWeight: 700, marginRight: 5 }}>{l.toUpperCase()}.</span>{option}
                  </div>
                })}
              </div>
            )}
            {q.question_type === "sequence" && (
              <div>{[q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean).map((item, idx) => (
                <div key={idx} style={{ font: "400 12px/1.35 'Inter'", padding: "3px 5px", color: "#B9A8D9", display: "flex", gap: 5 }}>
                  <span style={{ color: "#6B5A8E", fontWeight: 700 }}>{idx + 1}.</span>{item}
                </div>
              ))}</div>
            )}
            {(q.question_type === "text_answer" || q.question_type === "number") && (
              <div>
                {q.option_a && <p style={{ color: "#6B5A8E", font: "400 11px 'Inter'", margin: "0 0 4px" }}>Hint: {q.option_a}</p>}
              </div>
            )}
            <div style={{ color: "#2EE06E", font: "600 12px/1.35 'Inter'", marginTop: 6 }}>→ {q.correct_answer}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {rounds.length > 0 && (
                <select aria-label={`Add ${q.question_text} to round`} onChange={e => { if (e.target.value) { addToRound(q, e.target.value); } e.target.value = ""; }} style={selectStyle}>
                  <option value="">Add to round…</option>
                  {[...new Set(rounds.filter(round => round.table === "quiz_rounds").map(round => round.quizName || "Quiz Plan"))].map(quizName => <optgroup key={quizName} label={quizName}>{rounds.filter(round => round.table === "quiz_rounds" && (round.quizName || "Quiz Plan") === quizName).map(round => { const unavailable = roundUnavailableReason(round, q); return <option key={`quiz_rounds:${round.id}`} value={`quiz_rounds:${round.id}`} disabled={Boolean(unavailable)}>{round.name}{unavailable ? ` — ${unavailable}` : ""}</option>; })}</optgroup>)}
                  {rounds.some(round => round.table === "rounds") && <optgroup label="Reusable Round Library">{rounds.filter(round => round.table === "rounds").map(round => { const unavailable = roundUnavailableReason(round, q); return <option key={`rounds:${round.id}`} value={`rounds:${round.id}`} disabled={Boolean(unavailable)}>{round.name}{unavailable ? ` — ${unavailable}` : ""}</option>; })}</optgroup>}
                </select>
              )}
              <HostButton onClick={() => deleteQuestion(q.id)} style={{ height: 32, padding: "0 10px", fontSize: 11 }}>Delete</HostButton>
            </div>
          </article>
        );})}
        </div>
        {!loading && filtered.length > PAGE_SIZE && <nav className="qi-bo-pagination" aria-label="Question pages"><HostButton disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</HostButton><span>Page {page} of {pageCount}</span><HostButton disabled={page === pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>Next</HostButton></nav>}
      </main>
      {confirmDialogEl}
      {promptDialogEl}
    </HostShell>
  );
}
