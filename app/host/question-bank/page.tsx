"use client";
import { useCallback, useEffect, useState } from "react";
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
  needs_review: boolean | null;
  review_note: string | null;
  times_used: number | null;
  created_at: string;
};

type RoundTarget = { id: string; name: string; round_type: string; questions: BankQuestion[]; table: "rounds" | "quiz_rounds"; quizName?: string };

const typeLabel: Record<string,string> = { multiple_choice:"Multiple Choice", multi_tap:"Multi Tap", text_answer:"Text Answer", number:"Number", nearest_wins:"Nearest Wins", sequence:"Sequence", picture:"Picture", audio:"Music" };
const TOPICS = ["Sport", "Geography", "History", "Science & Nature", "Music", "Film & TV", "Literature & Language", "Food & Drink", "General Knowledge", "Current Affairs", "Art & Culture"];
const PAGE_SIZE = 20;
const selectStyle: React.CSSProperties = { height: 32, minWidth: 148, padding: "0 9px", borderRadius: 8, background: "#150A2E", color: "#F4EFFF", border: "1px solid #4D3175", fontSize: 11, fontFamily: "'Inter',sans-serif", cursor: "pointer", outline: "none" };
const questionKey = (question: { question_text?: unknown; correct_answer?: unknown }) => {
  const normalise = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `${normalise(question.question_text)}|${normalise(question.correct_answer)}`;
};

// Keep the full question payload, including explanation and media playback
// settings, but never copy the library row's identity/ownership/review metadata.
const copyQuestion = (question: BankQuestion) => Object.fromEntries(Object.entries(question).filter(([key]) => !["id", "created_at", "updated_at", "user_id", "owner_id", "needs_review", "stale_risk", "review_note", "times_used", "source", "topic"].includes(key)));

export default function QuestionBankPage() {
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirmDialog();
  const { promptDialog, dialog: promptDialogEl } = usePromptDialog();
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [matchingCount, setMatchingCount] = useState(0);
  const [needsReviewCount, setNeedsReviewCount] = useState(0);
  const [rounds, setRounds] = useState<RoundTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("");
  // Default view NEVER shows unreviewed/imported-but-unapproved questions -
  // "review" mode is opt-in, specifically for approving/rejecting them.
  const [reviewMode, setReviewMode] = useState<"approved" | "needs_review" | "all">("approved");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  type RoundWithQuestions = { id: string; name: string; questions: BankQuestion[] };
  type Mismatch = { roundId: string; roundName: string; index: number; question_text: string; correct_answer: string };
  const [fullRounds, setFullRounds] = useState<RoundWithQuestions[]>([]);
  const [showTypeFixer, setShowTypeFixer] = useState(false);
  const [selectedQuestions, setSelectedQuestions] = useState<Map<string, BankQuestion>>(new Map());
  const [buildRoundType, setBuildRoundType] = useState("regular");
  const [pickerQuestion, setPickerQuestion] = useState<BankQuestion | null>(null);
  const [roundSearch, setRoundSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const loadCounts = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { count: total } = await supabase.from("question_bank").select("id", { count: "exact", head: true });
    const { count: needsReview } = await supabase.from("question_bank").select("id", { count: "exact", head: true }).eq("needs_review", true);
    setTotalCount(total || 0);
    setNeedsReviewCount(needsReview || 0);
  }, []);

  const loadQuestions = useCallback(async (targetPage: number) => {
    setListLoading(true);
    const supabase = createSupabaseBrowserClient();
    let query = supabase.from("question_bank").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (reviewMode === "approved") query = query.or("needs_review.is.null,needs_review.eq.false");
    else if (reviewMode === "needs_review") query = query.eq("needs_review", true);
    if (filter !== "all") query = query.eq("question_type", filter);
    if (topicFilter) query = query.eq("topic", topicFilter);
    if (search.trim().length >= 2) {
      const term = search.trim().replace(/[%_,]/g, " ");
      query = query.or(`question_text.ilike.%${term}%,correct_answer.ilike.%${term}%,topic.ilike.%${term}%`);
    }
    const from = (targetPage - 1) * PAGE_SIZE;
    const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (!error) {
      setQuestions((data || []) as BankQuestion[]);
      setMatchingCount(count || 0);
    }
    setListLoading(false);
  }, [reviewMode, filter, topicFilter, search]);

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const [{ data: rs }, { data: plans }] = await Promise.all([
        supabase.from("rounds").select("id, name, round_type, questions").order("created_at", { ascending: false }),
        supabase.from("quizzes").select("id,name,quiz_rounds(id,name,round_type,questions,position)").eq("archived", false).order("updated_at", { ascending: false }),
      ]);
      const reusable = (rs || []).map(round => ({ ...round, questions: (round.questions || []) as BankQuestion[], table: "rounds" as const }));
      const planRounds = (plans || []).flatMap(plan => ((plan.quiz_rounds || []) as { id: string; name: string; round_type: string; questions: BankQuestion[]; position: number }[]).sort((a, b) => a.position - b.position).map(round => ({ id: round.id, name: round.name, round_type: round.round_type, questions: round.questions || [], table: "quiz_rounds" as const, quizName: plan.name })));
      setRounds([...planRounds, ...reusable]);
      if (rs) setFullRounds(rs as RoundWithQuestions[]);
      await loadCounts();
      await loadQuestions(1);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (!loading) { setPage(1); void loadQuestions(1); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [reviewMode, filter, topicFilter, search]);
  useEffect(() => { if (!loading) void loadQuestions(page); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page]);

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
    await loadCounts();
  }

  // Rows imported from SpeedQuizzing that originally had a picture never
  // got that picture imported (the source export has no usable image URL,
  // only a has_picture flag) - importToQuestionBank.mjs flags these with a
  // review_note instead of setting question_type: "picture", so approving
  // one as-is puts a text-only question live whose wording ("...in this
  // photo?") refers to an image that will never actually appear on screen.
  const hasMissingPicture = (q: BankQuestion) => !!q.review_note && /picture/i.test(q.review_note) && q.question_type !== "picture";

  async function approveQuestion(id: string) {
    const target = questions.find(q => q.id === id);
    if (target && hasMissingPicture(target)) {
      const proceed = await confirmDialog(
        "This question's original had a picture that was never imported - approving it now will show players the question text (which may reference \"this photo\") with no image at all. Attach a picture first (edit the question and set it up as a Picture question) unless you're sure it still makes sense without one.\n\nApprove anyway?",
        { tone: "destructive", confirmLabel: "Approve anyway" }
      );
      if (!proceed) return;
    }
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("question_bank").update({ needs_review: false }).eq("id", id);
    if (error) { setStatus("Could not approve: " + error.message); return; }
    setQuestions(prev => reviewMode === "needs_review" ? prev.filter(q => q.id !== id) : prev.map(q => q.id === id ? { ...q, needs_review: false } : q));
    await loadCounts();
  }

  async function approveAllInView() {
    if (bulkBusy) return;
    const label = topicFilter ? `${topicFilter}${filter !== "all" ? ` / ${typeLabel[filter]}` : ""}` : (filter !== "all" ? typeLabel[filter] : "all");
    const confirmed = await confirmDialog(`Approve all ${matchingCount.toLocaleString()} needs-review question(s) matching ${label}? They'll immediately become pickable in Quiz Plans and Random From Library.\n\nQuestions still flagged as missing an original picture will be skipped - approve those individually once a picture's attached.`, { confirmLabel: "Approve all" });
    if (!confirmed) return;
    setBulkBusy(true);
    const supabase = createSupabaseBrowserClient();
    // review_note is null for almost all rows - .not("ilike") alone would
    // evaluate to NULL (and so exclude) every one of those, so null must be
    // explicitly allowed through alongside "doesn't mention picture".
    let query = supabase.from("question_bank").update({ needs_review: false }).eq("needs_review", true).or("review_note.is.null,review_note.not.ilike.%picture%");
    if (filter !== "all") query = query.eq("question_type", filter);
    if (topicFilter) query = query.eq("topic", topicFilter);
    if (search.trim().length >= 2) {
      const term = search.trim().replace(/[%_,]/g, " ");
      query = query.or(`question_text.ilike.%${term}%,correct_answer.ilike.%${term}%,topic.ilike.%${term}%`);
    }
    const { error } = await query;
    setBulkBusy(false);
    if (error) { setStatus("Bulk approve failed: " + error.message); return; }
    setStatus(`Approved matching questions (any still missing a picture were skipped).`);
    await loadCounts();
    await loadQuestions(1);
    setPage(1);
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
    const limit = target.round_type === "hot_seat" ? 5 : target.round_type === "pursuit" ? 7 : Infinity;
    if (currentQuestions.length >= limit) { setStatus(`That round is full (${limit} questions).`); return; }
    const newQs = [...currentQuestions, copyQuestion(q)];
    const { data: saved, error: saveError } = await supabase.from(table).update({ questions: newQs }).eq("id", roundId).select("questions").single();
    if (saveError) { setStatus("Question was not added: " + saveError.message); return; }
    const persistedQuestions = (saved?.questions || []) as BankQuestion[];
    setRounds(prev => prev.map(item => item.id === roundId && item.table === table ? { ...item, questions: persistedQuestions } : item));
    setFullRounds(prev => prev.map(item => item.id === roundId ? { ...item, questions: persistedQuestions } : item));
    setStatus(`Added to “${target.name}”${target.quizName ? ` in ${target.quizName}` : " in the Round Library"}. Round now has ${persistedQuestions.length} questions.`);
    setPickerQuestion(null);
  }

  async function buildRoundFromSelection() {
    const selectedList = Array.from(selectedQuestions.values());
    if (!selectedList.length) { setStatus("Select at least one question first."); return; }
    if (buildRoundType === "multi_tap" && selectedList.some(question => question.question_type !== "multi_tap")) { setStatus("A Multi Tap round can only contain Multi Tap questions."); return; }
    if (buildRoundType === "music" && selectedList.some(question => question.question_type !== "audio")) { setStatus("A Music round can only contain prepared music questions."); return; }
    if (buildRoundType === "hot_seat" && selectedList.length !== 5) { setStatus("A Hot Seat round must contain exactly 5 questions."); return; }
    if (buildRoundType === "pursuit" && selectedList.length !== 7) { setStatus("A Pursuit round must contain exactly 7 questions."); return; }
    const name = await promptDialog("Name this new reusable round.", `New ${buildRoundType === "regular" ? "General Knowledge" : typeLabel[buildRoundType] || buildRoundType} Round`, { title: "Build a round", confirmLabel: "Create round", placeholder: "Round name" });
    if (!name?.trim()) return;
    const supabase = createSupabaseBrowserClient();
    const payload = selectedList.map(copyQuestion);
    const { data, error } = await supabase.from("rounds").insert({ name: name.trim(), round_type: buildRoundType, difficulty: "mixed", questions: payload, hide_leaderboard: false, allow_power_cards: true, points_per_question: null }).select("id,name,questions").single();
    if (error || !data) { setStatus("Round was not created: " + (error?.message || "Unknown error")); return; }
    setRounds(prev => [...prev, { id: data.id, name: data.name, round_type: buildRoundType, questions: (data.questions || []) as BankQuestion[], table: "rounds" }]);
    setFullRounds(prev => [...prev, { id: data.id, name: data.name, questions: (data.questions || []) as BankQuestion[] }]);
    setSelectedQuestions(new Map());
    setStatus(`Created “${data.name}” with ${selectedList.length} question${selectedList.length === 1 ? "" : "s"}.`);
  }

  const pageCount = Math.max(1, Math.ceil(matchingCount / PAGE_SIZE));
  const roundUnavailableReason = (round: RoundTarget, question: BankQuestion): string => {
    if (round.questions.some(existing => questionKey(existing) === questionKey(question))) return "already added";
    if (round.round_type === "multi_tap" && question.question_type !== "multi_tap") return "Multi Tap questions only";
    if (round.round_type === "music" && question.question_type !== "audio") return "music questions only";
    if (round.round_type === "hot_seat" && round.questions.length >= 5) return "full (5 questions)";
    if (round.round_type === "pursuit" && round.questions.length >= 7) return "full (7 questions)";
    return "";
  };
  const selectedList = Array.from(selectedQuestions.values());

  return (
    <HostShell>
      <main className="qi-bo-page" style={{ minHeight: "100vh", background: STAGE_BG, color: "#fff" }}>
        <header className="qi-bo-pagehead">
          <div><p>Question inventory</p><h1>Question Library</h1><span>Find, review and place saved questions into reusable rounds.</span></div>
          <div className="qi-bo-page-actions"><Link className="fbh-btn" href="/host/rounds">Round Library</Link><Link className="fbh-btn pri" href="/host/questions">Generate Questions</Link></div>
        </header>

        <section className="qi-bo-library-summary" aria-label="Question library summary">
          <div><strong>{totalCount.toLocaleString()}</strong><span>Saved questions</span></div>
          <div><strong>{needsReviewCount.toLocaleString()}</strong><span>Needs review</span></div>
          <div><strong>{matchingCount.toLocaleString()}</strong><span>Matching this view</span></div>
          <div><strong>{rounds.length}</strong><span>Available rounds</span></div>
        </section>

        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          <Chip on={reviewMode === "approved"} onClick={() => setReviewMode("approved")}>Approved (usable)</Chip>
          <Chip on={reviewMode === "needs_review"} onClick={() => setReviewMode("needs_review")}>Needs review {needsReviewCount > 0 ? `(${needsReviewCount.toLocaleString()})` : ""}</Chip>
          <Chip on={reviewMode === "all"} onClick={() => setReviewMode("all")}>All</Chip>
        </div>

        {status && <div role="status" style={{ padding: 12, border: "1px solid #4D3175", borderRadius: 10, color: "#D9CCF2", font: "600 13px 'Inter'", marginBottom: 16 }}>{status}<button type="button" onClick={() => setStatus("")} style={{ marginLeft: 12, background: "none", border: 0, color: "#D94FDC", cursor: "pointer" }}>Dismiss</button><div style={{ marginTop: 8 }}><Link href="/host/rounds">Open Round Library</Link> · <Link href="/host/quizzes">Open Quiz Plans / add a saved round</Link></div></div>}

        {reviewMode === "needs_review" && matchingCount > 0 && (
          <div className="fbh-panel" style={{ marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span style={{ color: "#B9A8D9", font: "400 13px 'Inter'" }}>These questions won't appear anywhere else - not in round-building, not in Random From Library, not in AI generation - until approved.</span>
            <HostButton onClick={approveAllInView} disabled={bulkBusy} style={{ height: 34, padding: "0 14px" }}>{bulkBusy ? "APPROVING…" : `APPROVE ALL ${matchingCount.toLocaleString()} IN THIS VIEW`}</HostButton>
          </div>
        )}

        {numberTypeMismatches.length > 0 && (
          <div className="fbh-panel" style={{ marginBottom: 20, border: "1px solid rgba(250,204,21,0.4)", background: "rgba(250,204,21,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setShowTypeFixer(v => !v)}>
              <strong style={{ color: "#facc15" }}>{"⚠"} {numberTypeMismatches.length} question{numberTypeMismatches.length === 1 ? "" : "s"} may show the wrong keyboard to players</strong>
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
          onChange={e => setSearch(e.target.value)}
          placeholder="Search questions, topics or answers…"
          aria-label="Search saved questions"
          style={{ marginBottom: 14 }}
        />

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {["all", "multiple_choice", "multi_tap", "text_answer", "number", "nearest_wins", "sequence", "picture", "audio"].map(f => (
            <Chip key={f} on={filter === f} onClick={() => setFilter(f)}>{f === "all" ? "All questions" : typeLabel[f]}</Chip>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <Chip on={topicFilter === ""} onClick={() => setTopicFilter("")}>All topics</Chip>
          {TOPICS.map(t => <Chip key={t} on={topicFilter === t} onClick={() => setTopicFilter(t)}>{t}</Chip>)}
        </div>

        <section className="fbh-panel" style={{ marginBottom: 18, padding: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", position: "sticky", bottom: 0, zIndex: 10 }} aria-label="Build a round from selected questions">
          <div style={{ minWidth: 180, flex: 1 }}><strong style={{ display: "block", font: "700 14px 'Inter'" }}>Build a round</strong><span style={{ color: "#B9A8D9", font: "400 11px 'Inter'" }}>{selectedList.length ? `${selectedList.length} question${selectedList.length === 1 ? "" : "s"} selected` : "Select question cards below"}</span></div>
          <select value={buildRoundType} onChange={event => setBuildRoundType(event.target.value)} aria-label="New round type" style={selectStyle}>
            <option value="regular">General Knowledge</option><option value="bonus">Bonus / Themed</option><option value="music">Music</option><option value="multi_tap">Multi Tap</option><option value="nearest_wins">Nearest Wins</option><option value="pursuit">The Pursuit</option><option value="hot_seat">Hot Seat</option>
          </select>
          <HostButton onClick={async () => { setSaving(true); try { await buildRoundFromSelection(); } finally { setSaving(false); } }} disabled={saving || !selectedList.length} style={{ height: 34, padding: "0 12px", fontSize: 11 }}>{saving ? "SAVING…" : "CREATE ROUND"}</HostButton>
          {selectedList.length > 0 && <HostButton onClick={() => setSelectedQuestions(new Map())} style={{ height: 34, padding: "0 10px", fontSize: 11 }}>Clear</HostButton>}
          {selectedList.length > 0 && <details style={{ width: "100%" }}><summary style={{ cursor: "pointer", color: "#D94FDC" }}>Preview selected questions</summary><ol style={{ maxHeight: 220, overflowY: "auto", paddingLeft: 24 }}>{selectedList.map(q => <li key={q.id} style={{ margin: "8px 0", fontSize: 12 }}>{q.question_text}<div><button onClick={() => setSelectedQuestions(prev => { const next = new Map(prev); next.delete(q.id); return next; })}>Remove</button></div></li>)}</ol></details>}
        </section>

        {(loading || listLoading) && <HostLoading title="Question Bank" note="Loading saved questions…" />}
        {!loading && !listLoading && questions.length === 0 && (
          <p style={{ textAlign: "center", color: "#6B5A8E", font: "400 13px 'Inter'" }}>
            {search.trim().length >= 2 ? "No questions match your search." : reviewMode === "needs_review" ? "Nothing waiting for review." : "No questions in the bank yet."}
          </p>
        )}

        {!loading && !listLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 12, alignItems: "start" }}>
        {questions.map(q => {
          const optionLetters = q.question_type === "multi_tap" ? ["a", "b", "c", "d", "e", "f"] : ["a", "b", "c", "d"];
          const correctLetters = q.correct_answer.toLowerCase().split(",").map(value => value.trim());
          const isPicture = q.question_type === "picture";
          const isAudio = q.question_type === "audio";
          const isHovered = hoveredId === q.id;
          const body = (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", color: selectedQuestions.has(q.id) ? "#2EE06E" : "#B9A8D9", font: "600 11px 'Inter'" }}><input type="checkbox" checked={selectedQuestions.has(q.id)} onChange={event => setSelectedQuestions(prev => { const next = new Map(prev); if (event.target.checked) next.set(q.id, q); else next.delete(q.id); return next; })} /> Select</label>
                <span className="fbh-chip">{typeLabel[q.question_type] || q.question_type}</span>
                <span style={{ color: "#B9A8D9", font: "500 11px 'Inter'" }}>{q.difficulty}</span>
                {q.topic && <span style={{ color: "#6B5A8E", font: "500 11px 'Inter'" }}>{q.topic}</span>}
                {!!q.times_used && <span style={{ color: "#FFC533", font: "700 11px 'Inter'" }}>USED {q.times_used}×</span>}
                <div style={{ flex: 1 }} />
                {q.needs_review && <span style={{ color: "#facc15", font: "700 11px 'Inter'" }}>NEEDS REVIEW</span>}
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
              {q.review_note && <div style={{ color: "#FFC533", font: "400 11px/1.35 'Inter'", marginTop: 4 }}>⚠ {q.review_note}</div>}
            </>
          );
          return (
          <article
            key={q.id}
            className="fbh-panel"
            onMouseEnter={() => setHoveredId(q.id)}
            onMouseLeave={() => setHoveredId(prev => prev === q.id ? null : prev)}
            style={{ margin: 0, padding: 14, minWidth: 0, position: "relative", border: q.needs_review ? "1px solid rgba(250,204,21,0.35)" : undefined, display: "flex", flexDirection: "column", height: 380 }}
          >
            {/* Uniform-height collapsed view - clipped so every card lines up the same */}
            <div style={{ flex: 1, overflow: "hidden" }}>{body}</div>
            {/* Hover expands the full, untruncated content in a popover above everything else */}
            {isHovered && (
              <div style={{ position: "absolute", top: -1, left: -1, right: -1, zIndex: 40, background: "#150A2E", border: "1px solid #BE26C1", borderRadius: 12, padding: 14, boxShadow: "0 12px 32px rgba(0,0,0,0.55)", maxHeight: 480, overflowY: "auto" }}>
                {body}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {q.needs_review && <HostButton onClick={() => approveQuestion(q.id)} style={{ height: 32, padding: "0 10px", fontSize: 11 }}>Approve</HostButton>}
              {!q.needs_review && <HostButton onClick={() => { setPickerQuestion(q); setRoundSearch(""); }} style={{ height: 32, padding: "0 10px", fontSize: 11 }}>Add to round…</HostButton>}
              <HostButton onClick={() => deleteQuestion(q.id)} style={{ height: 32, padding: "0 10px", fontSize: 11 }}>Delete</HostButton>
            </div>
          </article>
        );})}
        </div>
        )}
        {!loading && !listLoading && matchingCount > PAGE_SIZE && <nav className="qi-bo-pagination" aria-label="Question pages"><HostButton disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</HostButton><span>Page {page} of {pageCount}</span><HostButton disabled={page === pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>Next</HostButton></nav>}
      </main>
      {confirmDialogEl}
      {promptDialogEl}
      {pickerQuestion && <div className="qi-confirm"><button className="qi-confirm__scrim" aria-label="Close round picker" onClick={() => setPickerQuestion(null)} /><section className="qi-confirm__panel" role="dialog" aria-modal="true" aria-label="Choose a round"><h2>Add question to a round</h2><p>{pickerQuestion.question_text}</p><HostInput autoFocus placeholder="Search Quiz Plans or round names…" value={roundSearch} onChange={event => setRoundSearch(event.target.value)} aria-label="Search destination rounds" /><div style={{ maxHeight: "45vh", overflowY: "auto", marginTop: 12 }}>{rounds.filter(round => `${round.quizName || "Reusable Round Library"} ${round.name}`.toLowerCase().includes(roundSearch.toLowerCase())).map(round => { const reason = roundUnavailableReason(round, pickerQuestion); return <HostButton key={`${round.table}:${round.id}`} disabled={saving || Boolean(reason)} onClick={async () => { setSaving(true); try { await addToRound(pickerQuestion, `${round.table}:${round.id}`); } finally { setSaving(false); } }} style={{ width: "100%", height: "auto", padding: 10, marginBottom: 6, textAlign: "left", display: "block" }}><small style={{ display: "block", color: "#B9A8D9" }}>{round.quizName || "Reusable Round Library"}</small>{round.name} · {round.questions.length} questions{reason ? ` — ${reason}` : ""}</HostButton>; })}{!rounds.length && <p>No rounds yet. Close this picker and use Build a round.</p>}</div><HostButton onClick={() => setPickerQuestion(null)}>Close</HostButton></section></div>}
    </HostShell>
  );
}
