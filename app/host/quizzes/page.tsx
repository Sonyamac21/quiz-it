"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LibraryRound, QuizDefinition, QuizRound } from "@/lib/quiz-builder/types";
import { generateAllRounds, generateValidatedRound, loadUsedQuestions, type RoundGenerationSpec } from "@/lib/quiz/generateRound";
import { PURSUIT_TOTAL_QUESTIONS } from "@/lib/quiz/pursuit";
import { HostButton, HostEmpty, HostInput, HostLabel, HostLoading, HostShell, Toggle } from "@/components/fable/HostConsole";

const BG = "radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118";

type GuidedIntent = "create" | "duplicate" | "assign";
type GuidedEvent = { id: string; label: string };
const VALID_INTENTS: GuidedIntent[] = ["create", "duplicate", "assign"];
// Shape of a saved Question Library row (question_bank table) - only the
// fields this page reads/writes when inserting one into a Quiz Plan round.
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
};

export default function QuizBuilderPage() {
  const [quizzes, setQuizzes] = useState<QuizDefinition[]>([]);
  const [rounds, setRounds] = useState<LibraryRound[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [roundTypeFilter, setRoundTypeFilter] = useState("");

  // Guided "Create / Assign Quiz" workflow, arrived at from a Calendar Event
  // that has no Quiz Plan yet (app/host/events/page.tsx). ?forEvent=<id> +
  // ?intent=create|duplicate|assign puts this page into a mode that, once a
  // quiz is ready, assigns it to that event and returns the host straight
  // back to it - no manual navigation required.
  const [guidedIntent, setGuidedIntent] = useState<GuidedIntent | null>(null);
  const [guidedEvent, setGuidedEvent] = useState<GuidedEvent | null>(null);
  // Distinguishes "haven't looked up the event yet" from "looked it up and
  // it genuinely doesn't exist" (deleted mid-workflow, stale/hand-typed
  // link, etc.) - without this a vanished event silently falls back to a
  // fake "this event" label instead of a clear dead end.
  const [guidedChecked, setGuidedChecked] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [showPlanList, setShowPlanList] = useState(true);
  const [swappingKey, setSwappingKey] = useState<string | null>(null);
  const [addRoundOpen, setAddRoundOpen] = useState(false);
  const [settingsOpenRoundId, setSettingsOpenRoundId] = useState<string | null>(null);
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const [addQuestionOpenId, setAddQuestionOpenId] = useState<string | null>(null);
  const [manualQText, setManualQText] = useState("");
  const [manualAText, setManualAText] = useState("");
  const [libraryOpenId, setLibraryOpenId] = useState<string | null>(null);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryResults, setLibraryResults] = useState<BankQuestion[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  // Bulk/parallel question generation ("Generate All Rounds"). Lives alongside
  // the existing per-round generator at /host/questions - this does not replace
  // it, it lets a host configure several rounds at once and generate them all
  // in parallel via generateAllRounds() (lib/quiz/generateRound.ts).
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkConfig, setBulkConfig] = useState<Record<string, { selected: boolean; count: number; theme: string; difficulty: string }>>({});
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<Record<string, string>>({});
  function openBulkGenerate() {
    if (!selected) return;
    const initial: Record<string, { selected: boolean; count: number; theme: string; difficulty: string }> = {};
    selected.quiz_rounds.forEach(r => {
      initial[r.id] = { selected: false, count: r.round_type === "pursuit" ? PURSUIT_TOTAL_QUESTIONS : (r.questions.length || 10), theme: "", difficulty: "mixed" };
    });
    setBulkConfig(initial);
    setBulkProgress({});
    setBulkOpen(true);
  }
  function updateBulkConfig(roundId: string, patch: Partial<{ selected: boolean; count: number; theme: string; difficulty: string }>) {
    setBulkConfig(prev => ({ ...prev, [roundId]: { ...prev[roundId], ...patch } }));
  }
  const ROUND_TYPE_LABELS: Record<string, string> = {
    regular: "Regular",
    multi_tap: "Multi Tap",
    pursuit: "The Pursuit",
    hot_seat: "Hot Seat",
    hard_deck: "The Hard Deck",
  };
  // Round types that are AI-question rounds and can be generated. Hard Deck
  // (and any future non-question round type) is added to the running order as
  // a placeholder only - it has its own standalone start button on the live
  // quiz screen and never needs generated questions.
  const GENERATABLE_ROUND_TYPES = new Set(["regular", "music", "multi_tap", "pursuit", "hot_seat"]);
  // Adds a brand-new, empty round straight into this Quiz Plan's running order
  // (no need to first create/save it in the Round Library) and immediately
  // selects it in the Generate All panel with sensible defaults, so a host can
  // plan an entire night - Round 1 Regular 10Q, Round 2 Multi Tap 10Q, etc. -
  // and then hit one Generate button, instead of pre-building each round in
  // the library first.
  async function addBlankRoundSlot(roundType: string) {
    if (!selected) return;
    const supabase = createSupabaseBrowserClient();
    const existingOfType = selected.quiz_rounds.filter(r => r.round_type === roundType).length;
    const name = ROUND_TYPE_LABELS[roundType] + " Round" + (existingOfType ? " " + (existingOfType + 1) : "");
    const { data, error: insertError } = await supabase.from("quiz_rounds").insert({
      quiz_id: selected.id,
      source_round_id: null,
      position: selected.quiz_rounds.length,
      name,
      round_type: roundType,
      difficulty: "mixed",
      questions: [],
      hide_leaderboard: false,
      allow_power_cards: true,
      points_per_question: null,
      danger_zone_enabled: false,
      danger_zone_penalty: 5,
      max_time_bonus: 5,
    }).select("*").single();
    if (insertError || !data) return;
    const newRound = data as QuizRound;
    setQuizzes(prev => prev.map(q => q.id === selected.id ? { ...q, quiz_rounds: [...q.quiz_rounds, newRound] } : q));
    if (GENERATABLE_ROUND_TYPES.has(roundType)) {
      setBulkConfig(prev => ({ ...prev, [newRound.id]: { selected: true, count: roundType === "pursuit" ? PURSUIT_TOTAL_QUESTIONS : 10, theme: "", difficulty: "mixed" } }));
      setBulkOpen(true);
    }
  }
  async function addManualQuestion(round: QuizRound, questionText: string, answerText: string) {
    if (!questionText.trim() || !answerText.trim()) return;
    const newQuestions = [...round.questions, { question_text: questionText.trim(), correct_answer: answerText.trim() }];
    const supabase = createSupabaseBrowserClient();
    await supabase.from("quiz_rounds").update({ questions: newQuestions }).eq("id", round.id);
    setQuizzes(prev => prev.map(q => q.id !== selected?.id ? q : { ...q, quiz_rounds: q.quiz_rounds.map(r => r.id === round.id ? { ...r, questions: newQuestions } : r) }));
    setManualQText(""); setManualAText("");
  }
  async function loadLibraryQuestions(roundType: string, search: string) {
    setLibraryLoading(true);
    const supabase = createSupabaseBrowserClient();
    let query = supabase.from("question_bank").select("*").eq("round_type", roundType).order("created_at", { ascending: false }).limit(25);
    if (search.trim()) query = query.ilike("question_text", "%" + search.trim() + "%");
    const { data } = await query;
    setLibraryResults((data || []) as BankQuestion[]);
    setLibraryLoading(false);
  }
  async function addLibraryQuestion(round: QuizRound, bankQ: BankQuestion) {
    // Kept in the Question Library after adding (not deleted) - a library
    // question is meant to be reusable across many quizzes, not consumed by
    // the first round that uses it.
    const newQuestions = [...round.questions, {
      question_text: bankQ.question_text, question_type: bankQ.question_type,
      option_a: bankQ.option_a, option_b: bankQ.option_b, option_c: bankQ.option_c, option_d: bankQ.option_d,
      correct_answer: bankQ.correct_answer, difficulty: bankQ.difficulty,
    }];
    const supabase = createSupabaseBrowserClient();
    await supabase.from("quiz_rounds").update({ questions: newQuestions }).eq("id", round.id);
    setQuizzes(prev => prev.map(q => q.id !== selected?.id ? q : { ...q, quiz_rounds: q.quiz_rounds.map(r => r.id === round.id ? { ...r, questions: newQuestions } : r) }));
  }
  async function removeRoundQuestion(round: QuizRound, qIndex: number) {
    const newQuestions = round.questions.filter((_, i) => i !== qIndex);
    const supabase = createSupabaseBrowserClient();
    await supabase.from("quiz_rounds").update({ questions: newQuestions }).eq("id", round.id);
    setQuizzes(prev => prev.map(q => q.id !== selected?.id ? q : { ...q, quiz_rounds: q.quiz_rounds.map(r => r.id === round.id ? { ...r, questions: newQuestions } : r) }));
  }
  async function swapRoundQuestion(round: QuizRound, qIndex: number) {
    const key = round.id + "-" + qIndex;
    setSwappingKey(key);
    try {
      const cfg = bulkConfig[round.id];
      const exclusions = await loadUsedQuestions();
      round.questions.forEach(q => {
        const text = (q as Record<string, unknown>).question_text as string | undefined;
        if (text) exclusions.used.push(text);
      });
      const result = await generateValidatedRound(
        { roundType: round.round_type, difficulty: cfg?.difficulty || "mixed", theme: cfg?.theme || "", count: 1 },
        exclusions,
      );
      if (result.questions.length === 0) {
        window.alert("Couldn't generate a replacement question: " + result.finalStatus);
        return;
      }
      const newQuestions = round.questions.map((q, i) => i === qIndex ? result.questions[0] : q);
      const supabase = createSupabaseBrowserClient();
      await supabase.from("quiz_rounds").update({ questions: newQuestions }).eq("id", round.id);
      setQuizzes(prev => prev.map(q => q.id !== selected?.id ? q : { ...q, quiz_rounds: q.quiz_rounds.map(r => r.id === round.id ? { ...r, questions: newQuestions } : r) }));
    } finally {
      setSwappingKey(null);
    }
  }
  async function runBulkGenerate() {
    if (!selected) return;
    const targets = selected.quiz_rounds.filter(r => bulkConfig[r.id]?.selected);
    if (!targets.length) return;
    setBulkRunning(true);
    const supabase = createSupabaseBrowserClient();
    const specs: RoundGenerationSpec[] = targets.map(r => ({
      roundType: r.round_type,
      difficulty: bulkConfig[r.id].difficulty,
      theme: bulkConfig[r.id].theme,
      count: bulkConfig[r.id].count,
    }));
    setBulkProgress(Object.fromEntries(targets.map(r => [r.id, "Queued..."])));
    try {
      await generateAllRounds(
        specs,
        (idx, status) => {
          const round = targets[idx];
          setBulkProgress(prev => ({ ...prev, [round.id]: status }));
        },
        (idx, result) => {
          // Save THIS round the instant it finishes, independent of every
          // other round in the batch - a slow, crashed, or failed round
          // elsewhere can never cause an already-successful round's
          // questions to go unsaved.
          const round = targets[idx];
          supabase.from("quiz_rounds").update({ questions: result.questions }).eq("id", round.id).then(() => {
            setQuizzes(prev => prev.map(q => {
              if (q.id !== selected.id) return q;
              return { ...q, quiz_rounds: q.quiz_rounds.map(r => r.id === round.id ? { ...r, questions: result.questions } : r) };
            }));
          });
        },
      );
    } finally {
      // Always runs, even if something above throws unexpectedly - the
      // Generate All button can never get stuck disabled again.
      setBulkRunning(false);
    }
  }

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const [{ data: quizData, error: quizError }, { data: roundData }] = await Promise.all([
      supabase.from("quizzes").select("*, quiz_rounds(*)").order("updated_at", { ascending: false }),
      supabase.from("rounds").select("id,name,round_type,difficulty,questions,hide_leaderboard,allow_power_cards,points_per_question,danger_zone_enabled,danger_zone_penalty,max_time_bonus").order("created_at", { ascending: false }),
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const forEvent = params.get("forEvent");
      const intentParam = params.get("intent");
      // Unrecognised/hand-edited intent values are ignored entirely rather
      // than entering a half-configured guided mode with no matching button
      // labels or behaviour - falls back to the plain Quiz Library.
      const intent = VALID_INTENTS.includes(intentParam as GuidedIntent) ? (intentParam as GuidedIntent) : null;
      if (!forEvent || !intent) return;
      setGuidedIntent(intent);
      createSupabaseBrowserClient().from("events").select("event_name,event_date,start_time").eq("id", forEvent).maybeSingle().then(({ data, error: fetchError }) => {
        if (data && !fetchError) setGuidedEvent({ id: forEvent, label: `${data.event_name} · ${data.event_date} ${String(data.start_time).slice(0, 5)}` });
        setGuidedChecked(true);
      }, () => setGuidedChecked(true));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function assignQuizToEvent(quizId: string) {
    if (!guidedEvent) return;
    setAssigning(true); setError("");
    // .select() so we can tell "updated nothing because the event vanished"
    // apart from a genuine success - a blind update matching zero rows
    // returns no error, which would otherwise redirect into a dead end.
    const { data: updated, error: assignError } = await createSupabaseBrowserClient().from("events").update({ quiz_definition_id: quizId, updated_at: new Date().toISOString() }).eq("id", guidedEvent.id).select("id");
    if (assignError) { setError(assignError.message); setAssigning(false); return; }
    if (!updated?.length) { setError("This calendar event no longer exists, so the Quiz Plan couldn't be attached. It's still saved in the Quiz Library."); setAssigning(false); return; }
    window.location.assign(`/host/events?event=${guidedEvent.id}`);
  }

  const selected = quizzes.find(q => q.id === selectedId) ?? null;
  const assignableQuizzes = quizzes.filter(q => !q.archived && q.quiz_rounds.length > 0);

  async function createQuiz() {
    if (!name.trim()) return;
    setSaving(true); setError("");
    const { data, error: saveError } = await createSupabaseBrowserClient().from("quizzes").insert({ name: name.trim(), description: description.trim() || null }).select().single();
    if (saveError) { setError(saveError.message); setSaving(false); return; }
    setName(""); setDescription("");
    if (guidedIntent === "create" && guidedEvent) { await assignQuizToEvent(data.id); return; }
    await load(); setSelectedId(data.id);
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
    const { error: saveError } = await createSupabaseBrowserClient().from("quiz_rounds").insert({ quiz_id: selected.id, source_round_id: round.id, position: selected.quiz_rounds.length, name: round.name, round_type: round.round_type, difficulty: round.difficulty, questions: round.questions, hide_leaderboard: round.hide_leaderboard ?? false, allow_power_cards: round.allow_power_cards ?? true, points_per_question: round.points_per_question ?? null, danger_zone_enabled: round.danger_zone_enabled ?? false, danger_zone_penalty: round.danger_zone_penalty ?? 5, max_time_bonus: round.max_time_bonus ?? 5 });
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
    // Duplicating a round copies its structure/settings only, not the
    // generated questions - a copied round is a fresh template to generate
    // into, not a clone of the same quiz content.
    await createSupabaseBrowserClient().from("quiz_rounds").insert({ ...copy, questions: [], quiz_id: selected.id, position: selected.quiz_rounds.length, name: round.name + " (Copy)" });
    await load();
  }

  async function renameRound(round: QuizRound, newName: string) {
    if (!newName.trim() || newName === round.name) return;
    await createSupabaseBrowserClient().from("quiz_rounds").update({ name: newName.trim() }).eq("id", round.id);
    await load();
  }

  async function updateRoundPoints(round: QuizRound, points: number | null) {
    await createSupabaseBrowserClient().from("quiz_rounds").update({ points_per_question: points }).eq("id", round.id);
    await load();
  }

  async function updateRoundVisibility(round: QuizRound, hideLeaderboard: boolean) {
    await createSupabaseBrowserClient().from("quiz_rounds").update({ hide_leaderboard: hideLeaderboard }).eq("id", round.id);
    await load();
  }

  async function updateRoundCards(round: QuizRound, allowPowerCards: boolean) {
    await createSupabaseBrowserClient().from("quiz_rounds").update({ allow_power_cards: allowPowerCards }).eq("id", round.id);
    await load();
  }

  async function updateRoundDangerZone(round: QuizRound, enabled: boolean) {
    await createSupabaseBrowserClient().from("quiz_rounds").update({ danger_zone_enabled: enabled }).eq("id", round.id);
    await load();
  }

  async function updateRoundDangerPenalty(round: QuizRound, penalty: number) {
    await createSupabaseBrowserClient().from("quiz_rounds").update({ danger_zone_penalty: penalty }).eq("id", round.id);
    await load();
  }

  async function updateRoundMaxTimeBonus(round: QuizRound, maxTimeBonus: number) {
    await createSupabaseBrowserClient().from("quiz_rounds").update({ max_time_bonus: maxTimeBonus }).eq("id", round.id);
    await load();
  }

  async function duplicateQuiz(quiz: QuizDefinition) {
    // Guards the whole duplicate operation, not just the subsequent guided
    // assign step - without this a fast double-click could fire two inserts
    // before either finished, leaving an orphaned duplicate quiz behind.
    if (duplicating) return;
    setDuplicating(true); setError("");
    const supabase = createSupabaseBrowserClient();
    const { data, error: copyError } = await supabase.from("quizzes").insert({ name: quiz.name + " (Copy)", description: quiz.description, venue_id: quiz.venue_id, host_id: quiz.host_id }).select().single();
    if (copyError || !data) { setError(copyError?.message || "Could not duplicate quiz"); setDuplicating(false); return; }
    if (quiz.quiz_rounds.length) await supabase.from("quiz_rounds").insert(quiz.quiz_rounds.map(round => ({ quiz_id: data.id, source_round_id: round.source_round_id, position: round.position, name: round.name, round_type: round.round_type, difficulty: round.difficulty, questions: [], hide_leaderboard: round.hide_leaderboard, allow_power_cards: round.allow_power_cards, points_per_question: round.points_per_question ?? null, notes: round.notes, sponsor: round.sponsor, danger_zone_enabled: round.danger_zone_enabled ?? false, danger_zone_penalty: round.danger_zone_penalty ?? 5, max_time_bonus: round.max_time_bonus ?? 5 })));
    if (guidedIntent === "duplicate" && guidedEvent) { await assignQuizToEvent(data.id); setDuplicating(false); return; }
    await load(); setSelectedId(data.id);
    setDuplicating(false);
  }

  async function archiveQuiz(quiz: QuizDefinition) { await createSupabaseBrowserClient().from("quizzes").update({ archived: !quiz.archived, updated_at: new Date().toISOString() }).eq("id", quiz.id); await load(); }
  async function deleteQuiz(quiz: QuizDefinition) {
    const supabase = createSupabaseBrowserClient();
    const { count } = await supabase.from("events").select("id", { count: "exact", head: true }).eq("quiz_definition_id", quiz.id);
    if (count) { setError("This Quiz Plan is assigned to an event. Archive it instead of deleting it."); return; }
    if (!confirm(`Delete “${quiz.name}”?`)) return;
    await supabase.from("quizzes").delete().eq("id", quiz.id); setSelectedId(null); await load();
  }

  return <HostShell><main className="qi-bo-page" style={{ minHeight: "100vh", background: BG, color: "#fff" }}>
    <header className="qi-bo-pagehead"><div><p>Programme planning</p><h1>Quiz Library</h1><span>A Quiz Plan is the running order for one night: pick rounds from the Round Library, put them in order, then assign the plan to a date on the Calendar.</span></div><div className="qi-bo-page-actions">
      <select value={selectedId ?? "__new__"} onChange={e => setSelectedId(e.target.value === "__new__" ? null : e.target.value)} style={{ minHeight: 44, padding: "0 12px", borderRadius: 10, background: "#150A2E", color: "#fff", border: "1px solid #2E1A52", font: "600 13px 'Inter'" }}>
        <option value="__new__">+ New Quiz Plan</option>
        {quizzes.map(q => <option key={q.id} value={q.id}>{q.name}{q.archived ? " (Archived)" : ""} - {q.quiz_rounds.length} rounds</option>)}
      </select>
      <Link className="fbh-btn" href="/host/rounds">Round Library</Link><Link className="fbh-btn pri" href="/host/session">Open Live Session</Link></div></header>
    {guidedIntent&&guidedEvent&&<section className="fbh-panel" role="status" style={{marginBottom:16,borderColor:"#BE26C1"}}>
      <strong style={{display:"block",marginBottom:4}}>
        {guidedIntent==="create"&&"Create a new Quiz Plan for this event"}
        {guidedIntent==="duplicate"&&"Duplicate an existing Quiz Plan for this event"}
        {guidedIntent==="assign"&&"Assign an existing Quiz Plan to this event"}
      </strong>
      <span style={{color:"#B9A8D9",fontSize:13}}>
        {guidedEvent.label}
        {guidedIntent==="create"&&" · Fill in the Quiz Plan on the left and create it - it'll be attached automatically."}
        {guidedIntent==="duplicate"&&" · Select a Quiz Plan on the left, then use Duplicate Quiz Plan - the copy is attached automatically."}
        {guidedIntent==="assign"&&" · Pick a Quiz Plan below to attach it immediately."}
        {assigning&&" · Assigning…"}
      </span>
      <div style={{marginTop:8}}><Link href={`/host/events?event=${guidedEvent.id}`} className="fbh-btn">CANCEL · BACK TO EVENT</Link></div>
    </section>}
    {guidedIntent&&guidedChecked&&!guidedEvent&&<section className="fbh-panel" role="alert" style={{marginBottom:16,borderColor:"#FF7070"}}>
      <strong style={{display:"block",marginBottom:4,color:"#FF8290"}}>This calendar event could not be found</strong>
      <span style={{color:"#B9A8D9",fontSize:13}}>It may have been deleted or the link may be out of date. You can still create or manage Quiz Plans below, but nothing will be attached automatically.</span>
      <div style={{marginTop:8}}><Link href="/host/events" className="fbh-btn">BACK TO CALENDAR</Link></div>
    </section>}
    {loading ? <HostLoading title="Quiz Library" note="Loading Quiz Plans and rounds…" /> : error && !quizzes.length ? <section className="qi-bo-setup-state" role="alert"><span>Setup required</span><h2>Quiz Library is not available yet</h2><p>The existing Quiz Builder database migration must be applied before Quiz Plans can be created. No data has been changed.</p><details><summary>Technical detail</summary><code>{error}</code></details></section> : <div className="qi-quiz-builder-grid" style={{ display: "block", maxWidth: "none" }}>

      <section className="fbh-panel" style={{ width: "100%" }}>{!selected ? (
        <div style={{ maxWidth: 480 }}>
          <HostInput value={name} onChange={e => setName(e.target.value)} placeholder="Thursday Night Quiz" />
          <HostLabel>Description</HostLabel>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" rows={2} className="fbh-input" style={{ width: "100%" }} />
          <HostButton variant="pri" onClick={createQuiz} disabled={!name.trim() || saving || assigning} style={{ width: "100%", marginTop: 10 }}>{guidedIntent === "create" ? "CREATE & ASSIGN TO EVENT" : "CREATE QUIZ PLAN"}</HostButton>
          {quizzes.length > 0 && <p style={{ color: "#6B5A8E", font: "400 12px 'Inter'", marginTop: 16 }}>Or pick an existing plan from the dropdown above.</p>}
        </div>
      ) : <>
        <HostLabel>Quiz Name</HostLabel><HostInput value={selected.name} onChange={e => setQuizzes(prev => prev.map(q => q.id === selected.id ? { ...q, name: e.target.value } : q))} /><HostLabel>Description</HostLabel><textarea value={selected.description || ""} onChange={e => setQuizzes(prev => prev.map(q => q.id === selected.id ? { ...q, description: e.target.value } : q))} rows={2} className="fbh-input" style={{ width: "100%" }} />
        <div style={{ display: "flex", gap: 8, margin: "12px 0 20px", flexWrap: "wrap" }}>{guidedIntent === "duplicate" ? <HostButton variant="pri" onClick={() => duplicateQuiz(selected)} disabled={assigning || duplicating}>{duplicating ? "DUPLICATING…" : "DUPLICATE & USE FOR THIS EVENT"}</HostButton> : <><HostButton variant="pri" onClick={saveDetails} disabled={saving}>SAVE QUIZ PLAN</HostButton><HostButton onClick={() => duplicateQuiz(selected)} disabled={duplicating}>{duplicating ? "DUPLICATING…" : "DUPLICATE QUIZ PLAN"}</HostButton><HostButton onClick={() => archiveQuiz(selected)}>{selected.archived ? "RESTORE" : "ARCHIVE"}</HostButton><HostButton onClick={() => deleteQuiz(selected)}>DELETE</HostButton></>}</div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div className="fbh-lbl" style={{ margin: 0 }}>Rounds</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <HostButton variant="pri" onClick={() => setAddRoundOpen(v => !v)}>{addRoundOpen ? "CLOSE" : "+ ADD ROUND"}</HostButton>
              <HostButton
                onClick={() => setBulkConfig(prev => {
                  const next = { ...prev };
                  selected.quiz_rounds.filter(r => GENERATABLE_ROUND_TYPES.has(r.round_type)).forEach(r => {
                    next[r.id] = { selected: true, count: r.round_type === "pursuit" ? PURSUIT_TOTAL_QUESTIONS : (prev[r.id]?.count ?? (r.questions.length || 10)), theme: prev[r.id]?.theme ?? "", difficulty: prev[r.id]?.difficulty ?? "mixed" };
                  });
                  return next;
                })}
                disabled={bulkRunning}
              >SELECT ALL ROUNDS</HostButton>
              <HostButton onClick={runBulkGenerate} disabled={bulkRunning || !selected.quiz_rounds.some(r => (bulkConfig[r.id] ?? { selected: false }).selected)}>
                {bulkRunning ? "GENERATING..." : "GENERATE ALL SELECTED"}
              </HostButton>
            </div>
          </div>
          {addRoundOpen && (
            <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: "#150A2E", border: "1px solid #2E1A52", display: "grid", gap: 10 }}>
              <div>
                <div style={{ color: "#B9A8D9", font: "600 12px 'Inter'", marginBottom: 6 }}>GENERATE A NEW ROUND WITH AI</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {Object.entries(ROUND_TYPE_LABELS).map(([rt, label]) => (
                    <HostButton key={rt} onClick={() => { addBlankRoundSlot(rt); setAddRoundOpen(false); }}>{label}</HostButton>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ color: "#B9A8D9", font: "600 12px 'Inter'", marginBottom: 6 }}>OR PICK AN EXISTING ROUND FROM THE LIBRARY</div>
                <select value={roundTypeFilter} onChange={e => setRoundTypeFilter(e.target.value)} style={{ marginBottom: 8, minHeight: 40, padding: "0 10px", borderRadius: 8, background: "#0A0118", color: "#fff", border: "1px solid #2E1A52", font: "500 13px 'Inter'" }}>
                  <option value="">All round types</option>
                  {Array.from(new Set(rounds.map(r => r.round_type))).sort().map(rt => <option key={rt} value={rt}>{rt}</option>)}
                </select>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8, maxHeight: 260, overflowY: "auto" }}>{rounds
                  .filter(r => !roundTypeFilter || r.round_type === roundTypeFilter)
                  .map(round => ({ round, added: selected.quiz_rounds.some(qr => qr.source_round_id === round.id) }))
                  .sort((a, b) => Number(a.added) - Number(b.added))
                  .map(({ round, added }) => (
                    <button key={round.id} onClick={() => { addRound(round); setAddRoundOpen(false); }} className="qi-mc-round-card" style={added ? { borderColor: "#2EE06E", background: "rgba(46,224,110,0.08)", opacity: 0.6 } : undefined}>
                      <strong>{added ? "Added: " : ""}{round.name}</strong>
                      <span style={{ display: "block", color: "#6B5A8E", font: "400 11px 'Inter'" }}>{round.questions.length} questions - {round.round_type}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        {!selected.quiz_rounds.length ? (
          <div style={{ color: "#B9A8D9", padding: 16 }}>Add the first round using &quot;+ ADD ROUND&quot; above.</div>
        ) : (() => {
          const activeRound = selected.quiz_rounds.find(r => r.id === activeRoundId) || selected.quiz_rounds[0];
          const activeIndex = selected.quiz_rounds.findIndex(r => r.id === activeRound.id);
          const isGeneratable = GENERATABLE_ROUND_TYPES.has(activeRound.round_type);
          const cfg = bulkConfig[activeRound.id] ?? { selected: false, count: activeRound.round_type === "pursuit" ? PURSUIT_TOTAL_QUESTIONS : (activeRound.questions.length || 10), theme: "", difficulty: "mixed" };
          const progress = bulkProgress[activeRound.id];
          const settingsOpen = settingsOpenRoundId === activeRound.id;
          const addQuestionOpen = addQuestionOpenId === activeRound.id;
          return (
            <>
              {/* One tab per round - the whole quiz at a glance, click a tab to work on just that round's questions. */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                {selected.quiz_rounds.map((round, index) => {
                  const isRoundGeneratable = GENERATABLE_ROUND_TYPES.has(round.round_type);
                  const roundCfg = bulkConfig[round.id];
                  const roundProgress = bulkProgress[round.id];
                  return (
                  <div
                    key={round.id}
                    onClick={() => setActiveRoundId(round.id)}
                    style={{
                      padding: "8px 14px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                      border: round.id === activeRound.id ? "2px solid #BE26C1" : "1px solid #2E1A52",
                      background: round.id === activeRound.id ? "rgba(190,38,193,0.15)" : "#150A2E",
                      color: "#fff", display: "flex", flexDirection: "column", gap: 2,
                    }}
                  >
                    {isRoundGeneratable && (
                      <label style={{ display: "flex", alignItems: "center", gap: 6, font: "600 11px 'Inter'", color: "#B9A8D9" }} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={roundCfg?.selected ?? false} onChange={e => updateBulkConfig(round.id, { selected: e.target.checked })} />
                        Include in Generate All
                      </label>
                    )}
                    <span style={{ font: "700 13px 'Inter'" }}>{index + 1}. {round.name}</span>
                    {roundProgress && <span style={{ color: "#2EE06E", font: "600 11px 'Inter'" }}>{roundProgress}</span>}
                    <span style={{ color: "#6B5A8E", font: "400 11px 'Inter'" }}>{round.questions.length} Q - {round.round_type}</span>
                  </div>
                  );
                })}
              </div>

              <div className="fbh-panel" style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span className="ord">{activeIndex + 1}</span>
                  <input
                    key={activeRound.id}
                    defaultValue={activeRound.name}
                    onBlur={e => renameRound(activeRound, e.target.value)}
                    style={{ flex: 1, minWidth: 0, background: "transparent", border: "1px solid transparent", borderBottom: "1px solid #2E1A52", color: "#fff", font: "700 16px 'Inter'", padding: "4px 2px" }}
                  />
                </div>
                <div style={{ color: "#6B5A8E", font: "400 12px 'Inter'", marginBottom: 12 }}>{activeRound.questions.length} questions - {activeRound.round_type}</div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  <HostButton onClick={() => setSettingsOpenRoundId(id => id === activeRound.id ? null : activeRound.id)}>{settingsOpen ? "HIDE SETTINGS" : "SETTINGS"}</HostButton>
                  <HostButton onClick={() => moveRound(activeIndex, -1)} disabled={activeIndex === 0}>UP</HostButton>
                  <HostButton onClick={() => moveRound(activeIndex, 1)} disabled={activeIndex === selected.quiz_rounds.length - 1}>DOWN</HostButton>
                  <HostButton onClick={() => duplicateRound(activeRound)}>COPY</HostButton>
                  <HostButton onClick={() => removeRound(activeRound)}>REMOVE</HostButton>
                </div>

                {settingsOpen && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginBottom: 12, padding: 12, borderRadius: 10, background: "#150A2E", border: "1px solid #2E1A52" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, font: "400 13px 'Inter'", color: "#B9A8D9" }}>
                        Points per Q
                        <input
                          type="number"
                          defaultValue={activeRound.points_per_question ?? ""}
                          placeholder="Default"
                          onBlur={e => updateRoundPoints(activeRound, e.target.value === "" ? null : Number(e.target.value))}
                          style={{ width: 100, padding: "6px 8px", borderRadius: 8, background: "#0A0118", border: "1px solid #2E1A52", color: "#fff", fontSize: 13 }}
                        />
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, font: "400 13px 'Inter'", color: "#B9A8D9" }}>
                        Show leaderboard
                        <Toggle on={!activeRound.hide_leaderboard} onClick={() => updateRoundVisibility(activeRound, !activeRound.hide_leaderboard)} />
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, font: "400 13px 'Inter'", color: "#B9A8D9" }}>
                        Power cards
                        <Toggle on={activeRound.allow_power_cards} onClick={() => updateRoundCards(activeRound, !activeRound.allow_power_cards)} />
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, font: "400 13px 'Inter'", color: "#B9A8D9" }}>
                        Danger Zone
                        <Toggle on={activeRound.danger_zone_enabled} onClick={() => updateRoundDangerZone(activeRound, !activeRound.danger_zone_enabled)} />
                      </label>
                      {activeRound.danger_zone_enabled && (
                        <label style={{ display: "flex", alignItems: "center", gap: 6, font: "400 13px 'Inter'", color: "#B9A8D9" }}>
                          Penalty
                          <input
                            type="number"
                            defaultValue={activeRound.danger_zone_penalty ?? 5}
                            onBlur={e => updateRoundDangerPenalty(activeRound, Number(e.target.value) || 0)}
                            style={{ width: 56, padding: "6px 8px", borderRadius: 8, background: "#0A0118", border: "1px solid #2E1A52", color: "#fff" }}
                          />
                        </label>
                      )}
                      <label style={{ display: "flex", alignItems: "center", gap: 6, font: "400 13px 'Inter'", color: "#B9A8D9" }}>
                        Max time bonus
                        <input
                          type="number"
                          defaultValue={activeRound.max_time_bonus ?? 5}
                          onBlur={e => updateRoundMaxTimeBonus(activeRound, Number(e.target.value) || 0)}
                          style={{ width: 56, padding: "6px 8px", borderRadius: 8, background: "#0A0118", border: "1px solid #2E1A52", color: "#fff" }}
                        />
                      </label>
                    </div>
                    {isGeneratable && (
                      <div style={{ display: "grid", gap: 8, padding: 10, marginBottom: 12, borderRadius: 10, background: "#150A2E", border: "1px solid #2E1A52" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, font: "600 13px 'Inter'", color: "#fff" }}>
                          <input type="checkbox" checked={cfg.selected} onChange={e => updateBulkConfig(activeRound.id, { selected: e.target.checked })} />
                          Include in Generate All
                        </label>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, font: "400 13px 'Inter'", color: "#B9A8D9" }}>
                            Questions
                            {activeRound.round_type === "pursuit"
                              ? <span style={{ color: "#fff" }}>7 (fixed)</span>
                              : <input type="number" value={cfg.count} onChange={e => updateBulkConfig(activeRound.id, { count: Number(e.target.value) || 0 })} style={{ width: 64, padding: "6px 8px", borderRadius: 8, background: "#0A0118", border: "1px solid #2E1A52", color: "#fff" }} />}
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, font: "400 13px 'Inter'", color: "#B9A8D9" }}>
                            Theme
                            <input type="text" value={cfg.theme} onChange={e => updateBulkConfig(activeRound.id, { theme: e.target.value })} placeholder="optional" style={{ width: 140, padding: "6px 8px", borderRadius: 8, background: "#0A0118", border: "1px solid #2E1A52", color: "#fff" }} />
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, font: "400 13px 'Inter'", color: "#B9A8D9" }}>
                            Difficulty
                            <select value={cfg.difficulty} onChange={e => updateBulkConfig(activeRound.id, { difficulty: e.target.value })} style={{ padding: "6px 8px", borderRadius: 8, background: "#0A0118", border: "1px solid #2E1A52", color: "#fff" }}>
                              <option value="easy">Easy</option>
                              <option value="mixed">Mixed</option>
                              <option value="hard">Hard</option>
                            </select>
                          </label>
                        </div>
                        {progress && <div style={{ font: "400 12px 'Inter'", color: "#2EE06E" }}>{progress}</div>}
                      </div>
                    )}
                  </>
                )}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                  <div className="fbh-lbl" style={{ margin: 0 }}>Questions</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <HostButton onClick={() => { setLibraryOpenId(id => { const next = id === activeRound.id ? null : activeRound.id; if (next) { setLibrarySearch(""); loadLibraryQuestions(activeRound.round_type, ""); } return next; }); setAddQuestionOpenId(null); }}>{libraryOpenId === activeRound.id ? "CLOSE" : "+ FROM LIBRARY"}</HostButton>
                    <HostButton onClick={() => { setAddQuestionOpenId(id => id === activeRound.id ? null : activeRound.id); setLibraryOpenId(null); }}>{addQuestionOpen ? "CLOSE" : "+ ADD QUESTION"}</HostButton>
                  </div>
                </div>
                {libraryOpenId === activeRound.id && (
                  <div style={{ display: "grid", gap: 8, padding: 12, marginBottom: 14, borderRadius: 10, background: "#150A2E", border: "1px solid #2E1A52" }}>
                    <input
                      value={librarySearch}
                      onChange={e => { setLibrarySearch(e.target.value); loadLibraryQuestions(activeRound.round_type, e.target.value); }}
                      placeholder={"Search " + activeRound.round_type + " questions..."}
                      className="fbh-input"
                      style={{ width: "100%" }}
                    />
                    {libraryLoading && <div style={{ color: "#6B5A8E", font: "400 12px 'Inter'" }}>Searching...</div>}
                    {!libraryLoading && libraryResults.length === 0 && <div style={{ color: "#6B5A8E", font: "400 12px 'Inter'" }}>No saved {activeRound.round_type} questions found in the Question Library.</div>}
                    <div style={{ display: "grid", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                      {libraryResults.map(bq => (
                        <div key={bq.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 10px", borderRadius: 8, background: "#0A0118", border: "1px solid #2E1A52" }}>
                          <div style={{ font: "400 12px 'Inter'", color: "#D9CCF2" }}>{bq.question_text} <span style={{ color: "#2EE06E" }}>{"-> " + bq.correct_answer}</span></div>
                          <HostButton onClick={() => addLibraryQuestion(activeRound, bq)} style={{ padding: "4px 10px", height: 28, fontSize: 12, flexShrink: 0 }}>ADD</HostButton>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {addQuestionOpen && (
                  <div style={{ display: "grid", gap: 8, padding: 12, marginBottom: 14, borderRadius: 10, background: "#150A2E", border: "1px solid #2E1A52" }}>
                    <input value={manualQText} onChange={e => setManualQText(e.target.value)} placeholder="Question" className="fbh-input" style={{ width: "100%" }} />
                    <input value={manualAText} onChange={e => setManualAText(e.target.value)} placeholder="Answer" className="fbh-input" style={{ width: "100%" }} />
                    <HostButton variant="pri" onClick={() => addManualQuestion(activeRound, manualQText, manualAText)} disabled={!manualQText.trim() || !manualAText.trim()}>ADD QUESTION</HostButton>
                  </div>
                )}

                {activeRound.questions.length === 0 && <p style={{ color: "#6B5A8E", font: "400 12px 'Inter'", margin: 0 }}>No questions in this round yet.</p>}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10 }}>
                  {activeRound.questions.map((q, qi) => {
                    const swapKey = activeRound.id + "-" + qi;
                    const isSwapping = swappingKey === swapKey;
                    return (
                      <div key={qi} style={{ position: "relative", padding: "12px 34px 12px 14px", borderRadius: 12, background: "#150A2E", border: "1px solid #2E1A52" }}>
                        <button
                          onClick={() => removeRoundQuestion(activeRound, qi)}
                          title="Remove question"
                          style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.08)", color: "#fff", cursor: "pointer", fontSize: 14, lineHeight: "22px", padding: 0 }}
                        >×</button>
                        <div style={{ font: "400 13px 'Inter'", color: "#D9CCF2", lineHeight: 1.5 }}>
                          <strong style={{ color: "#6B5A8E" }}>{qi + 1}.</strong> {String((q as Record<string, unknown>).question_text ?? "")}
                        </div>
                        <div style={{ color: "#2EE06E", font: "600 12px 'Inter'", marginTop: 6 }}>{"-> "}{String((q as Record<string, unknown>).correct_answer ?? "")}</div>
                        <HostButton onClick={() => swapRoundQuestion(activeRound, qi)} disabled={isSwapping} style={{ marginTop: 8, padding: "4px 10px", height: 26, fontSize: 11 }}>{isSwapping ? "SWAPPING..." : "SWAP"}</HostButton>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          );
        })()}
      </>}</section>
    </div>}
  </main></HostShell>;
}
