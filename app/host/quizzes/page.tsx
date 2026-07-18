"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LibraryRound, QuizDefinition, QuizRound } from "@/lib/quiz-builder/types";
import { HostButton, HostEmpty, HostInput, HostLabel, HostLoading, HostShell, TopSpacer } from "@/components/fable/HostConsole";

const BG = "radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118";

export default function QuizBuilderPage() {
  const [quizzes, setQuizzes] = useState<QuizDefinition[]>([]);
  const [rounds, setRounds] = useState<LibraryRound[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const [{ data: quizData, error: quizError }, { data: roundData }] = await Promise.all([
      supabase.from("quizzes").select("*, quiz_rounds(*)").order("updated_at", { ascending: false }),
      supabase.from("rounds").select("id,name,round_type,difficulty,questions,hide_leaderboard,allow_power_cards").order("created_at", { ascending: false }),
    ]);
    if (quizError) setError("Quiz Plan Builder migration is required. " + quizError.message);
    const normalized = ((quizData ?? []) as QuizDefinition[]).map(q => ({ ...q, quiz_rounds: [...(q.quiz_rounds ?? [])].sort((a, b) => a.position - b.position) }));
    setQuizzes(normalized);
    setRounds((roundData ?? []) as LibraryRound[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const selected = quizzes.find(q => q.id === selectedId) ?? null;

  async function createQuiz() {
    if (!name.trim()) return;
    setSaving(true); setError("");
    const { data, error: saveError } = await createSupabaseBrowserClient().from("quizzes").insert({ name: name.trim(), description: description.trim() || null }).select().single();
    if (saveError) setError(saveError.message);
    else { setName(""); setDescription(""); await load(); setSelectedId(data.id); }
    setSaving(false);
  }

  async function saveDetails() {
    if (!selected || !selected.name.trim()) return;
    setSaving(true);
    const { error: saveError } = await createSupabaseBrowserClient().from("quizzes").update({ name: selected.name.trim(), description: selected.description?.trim() || null, updated_at: new Date().toISOString() }).eq("id", selected.id);
    if (saveError) setError(saveError.message); else await load();
    setSaving(false);
  }

  async function addRound(round: LibraryRound) {
    if (!selected) return;
    const { error: saveError } = await createSupabaseBrowserClient().from("quiz_rounds").insert({ quiz_id: selected.id, source_round_id: round.id, position: selected.quiz_rounds.length, name: round.name, round_type: round.round_type, difficulty: round.difficulty, questions: round.questions, hide_leaderboard: round.hide_leaderboard ?? false, allow_power_cards: round.allow_power_cards ?? true });
    if (saveError) setError(saveError.message); else await load();
  }

  async function removeRound(round: QuizRound) {
    if (!selected) return;
    await createSupabaseBrowserClient().from("quiz_rounds").delete().eq("id", round.id);
    await normalizePositions(selected.id, selected.quiz_rounds.filter(r => r.id !== round.id));
    await load();
  }

  async function normalizePositions(quizId: string, ordered: QuizRound[]) {
    const supabase = createSupabaseBrowserClient();
    await Promise.all(ordered.map((round, index) => supabase.from("quiz_rounds").update({ position: index + 1000 }).eq("id", round.id).eq("quiz_id", quizId)));
    await Promise.all(ordered.map((round, index) => supabase.from("quiz_rounds").update({ position: index }).eq("id", round.id).eq("quiz_id", quizId)));
  }

  async function moveRound(index: number, direction: -1 | 1) {
    if (!selected) return;
    const target = index + direction;
    if (target < 0 || target >= selected.quiz_rounds.length) return;
    const ordered = [...selected.quiz_rounds];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    await normalizePositions(selected.id, ordered);
    await load();
  }

  async function duplicateRound(round: QuizRound) {
    if (!selected) return;
    const { id: _id, ...copy } = round;
    void _id;
    await createSupabaseBrowserClient().from("quiz_rounds").insert({ ...copy, quiz_id: selected.id, position: selected.quiz_rounds.length, name: round.name + " (Copy)" });
    await load();
  }

  async function duplicateQuiz(quiz: QuizDefinition) {
    const supabase = createSupabaseBrowserClient();
    const { data, error: copyError } = await supabase.from("quizzes").insert({ name: quiz.name + " (Copy)", description: quiz.description, venue_id: quiz.venue_id, host_id: quiz.host_id }).select().single();
    if (copyError || !data) { setError(copyError?.message || "Could not duplicate quiz"); return; }
    if (quiz.quiz_rounds.length) await supabase.from("quiz_rounds").insert(quiz.quiz_rounds.map(round => ({ quiz_id: data.id, source_round_id: round.source_round_id, position: round.position, name: round.name, round_type: round.round_type, difficulty: round.difficulty, questions: round.questions, hide_leaderboard: round.hide_leaderboard, allow_power_cards: round.allow_power_cards, notes: round.notes, sponsor: round.sponsor })));
    await load(); setSelectedId(data.id);
  }

  async function archiveQuiz(quiz: QuizDefinition) { await createSupabaseBrowserClient().from("quizzes").update({ archived: !quiz.archived, updated_at: new Date().toISOString() }).eq("id", quiz.id); await load(); }
  async function deleteQuiz(quiz: QuizDefinition) {
    const supabase = createSupabaseBrowserClient();
    const { count } = await supabase.from("events").select("id", { count: "exact", head: true }).eq("quiz_definition_id", quiz.id);
    if (count) { setError("This Quiz Plan is assigned to an event. Archive it instead of deleting it."); return; }
    if (!confirm(`Delete “${quiz.name}”?`)) return;
    await supabase.from("quizzes").delete().eq("id", quiz.id); setSelectedId(null); await load();
  }

  return <HostShell><main style={{ minHeight: "100vh", background: BG, color: "#fff", padding: "24px 32px" }}>
    <div className="fbh-top"><span className="fbh-wm"><span className="q">QUIZ-</span>IT</span><span className="fbh-bc">Quiz Plan Builder</span><TopSpacer /><Link className="fbh-btn" href="/host/rounds">Round Library</Link><Link className="fbh-btn pri" href="/host/session">Create Session</Link></div>
    {loading ? <HostLoading title="Quiz Plan Builder" note="Loading quizzes and rounds…" /> : error && !quizzes.length ? <div className="fbh-panel" role="alert">{error}</div> : <div className="qi-quiz-builder-grid">
      <section className="fbh-panel"><HostLabel>New Quiz Plan</HostLabel><HostInput value={name} onChange={e => setName(e.target.value)} placeholder="Thursday Night Quiz" /><textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" rows={2} className="fbh-input" style={{ width: "100%", marginTop: 8 }} /><HostButton variant="pri" onClick={createQuiz} disabled={!name.trim() || saving} style={{ width: "100%", marginTop: 10 }}>CREATE QUIZ PLAN</HostButton>
        <div className="fbh-lbl" style={{ marginTop: 22 }}>Your Quiz Plans</div>{quizzes.length ? quizzes.map(q => <button key={q.id} onClick={() => setSelectedId(q.id)} className="fbh-answer-row" style={{ width: "100%", cursor: "pointer", borderColor: q.id === selectedId ? "#BE26C1" : undefined, opacity: q.archived ? .55 : 1 }}><span className="nm">{q.name}</span><span className="ans">{q.quiz_rounds.length} rounds{q.archived ? " · Archived" : ""}</span></button>) : <HostEmpty title="No Quiz Plans Yet" note="Create one, then add reusable rounds." />}
      </section>
      <section className="fbh-panel">{!selected ? <HostEmpty title="Select a Quiz Plan" note="Choose a quiz to arrange its running order." /> : <>
        <HostLabel>Quiz Name</HostLabel><HostInput value={selected.name} onChange={e => setQuizzes(prev => prev.map(q => q.id === selected.id ? { ...q, name: e.target.value } : q))} /><HostLabel>Description</HostLabel><textarea value={selected.description || ""} onChange={e => setQuizzes(prev => prev.map(q => q.id === selected.id ? { ...q, description: e.target.value } : q))} rows={2} className="fbh-input" style={{ width: "100%" }} />
        <div style={{ display: "flex", gap: 8, margin: "12px 0 20px", flexWrap: "wrap" }}><HostButton variant="pri" onClick={saveDetails}>SAVE QUIZ PLAN</HostButton><HostButton onClick={() => duplicateQuiz(selected)}>DUPLICATE QUIZ PLAN</HostButton><HostButton onClick={() => archiveQuiz(selected)}>{selected.archived ? "RESTORE" : "ARCHIVE"}</HostButton><HostButton onClick={() => deleteQuiz(selected)}>DELETE</HostButton></div>
        <div className="fbh-lbl">Running Order</div>{selected.quiz_rounds.length ? selected.quiz_rounds.map((round, index) => <div key={round.id} className="fbh-answer-row"><span className="ord">{index + 1}</span><span className="nm">{round.name}</span><span className="ans">{round.questions.length} questions · {round.round_type} · {round.hide_leaderboard ? "Leaderboard hidden" : "Leaderboard shown"} · {round.allow_power_cards ? "Cards allowed" : "Cards paused"}</span><HostButton onClick={() => moveRound(index, -1)} disabled={index === 0}>↑</HostButton><HostButton onClick={() => moveRound(index, 1)} disabled={index === selected.quiz_rounds.length - 1}>↓</HostButton><HostButton onClick={() => duplicateRound(round)}>COPY</HostButton><HostButton onClick={() => removeRound(round)}>REMOVE</HostButton></div>) : <div style={{ color: "#B9A8D9", padding: 16 }}>Add the first round from the library below.</div>}
        <div className="fbh-lbl" style={{ marginTop: 20 }}>Add from Round Library</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 8 }}>{rounds.map(round => <button key={round.id} onClick={() => addRound(round)} className="qi-mc-round-card"><strong>{round.name}</strong><span>{round.round_type} · {round.questions.length} questions</span></button>)}</div>
      </>}</section>
    </div>}
  </main></HostShell>;
}
