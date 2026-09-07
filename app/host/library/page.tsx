"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { HostLoading, HostShell } from "@/components/fable/HostConsole";

const BG = "radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118";
const PAGE_SIZE = 50;

const TOPICS = ["Sport", "Geography", "History", "Science & Nature", "Music", "Film & TV", "Literature & Language", "Food & Drink", "General Knowledge", "Current Affairs", "Art & Culture"] as const;

type LibraryRow = {
  id: string;
  question_text: string;
  question_type: string;
  correct_answer: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  topic: string | null;
  source: string | null;
  needs_review: boolean | null;
  stale_risk: boolean | null;
  review_note: string | null;
  times_used: number | null;
};

type ReviewFilter = "needs_review" | "approved" | "all";

const field = { padding: "10px 12px", borderRadius: 10, background: "#150A2E", color: "#fff", border: "1px solid #2E1A52", font: "500 13px Inter" } as const;

export default function QuestionLibraryPage() {
  const [loading, setLoading] = useState(true);
  const [topicCounts, setTopicCounts] = useState<Record<string, number>>({});
  const [totalNeedsReview, setTotalNeedsReview] = useState(0);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("needs_review");
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadCounts = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const entries = await Promise.all(TOPICS.map(async topic => {
      const { count } = await supabase.from("question_bank").select("id", { count: "exact", head: true }).eq("topic", topic).eq("needs_review", true);
      return [topic, count || 0] as const;
    }));
    setTopicCounts(Object.fromEntries(entries));
    const { count: reviewCount } = await supabase.from("question_bank").select("id", { count: "exact", head: true }).eq("needs_review", true);
    setTotalNeedsReview(reviewCount || 0);
    setLoading(false);
  }, []);

  const loadRows = useCallback(async (reset: boolean) => {
    setRowsLoading(true);
    const supabase = createSupabaseBrowserClient();
    let query = supabase.from("question_bank").select("id,question_text,question_type,correct_answer,option_a,option_b,option_c,option_d,topic,source,needs_review,stale_risk,review_note,times_used").order("created_at", { ascending: false });
    if (selectedTopic) query = query.eq("topic", selectedTopic);
    if (reviewFilter === "needs_review") query = query.eq("needs_review", true);
    else if (reviewFilter === "approved") query = query.eq("needs_review", false);
    if (search.trim()) {
      const term = search.trim().replace(/[%_,]/g, " ");
      query = query.or(`question_text.ilike.%${term}%,correct_answer.ilike.%${term}%`);
    }
    const from = reset ? 0 : offset;
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (!error) {
      const nextRows = (data || []) as LibraryRow[];
      setRows(prev => reset ? nextRows : [...prev, ...nextRows]);
      setOffset(from + nextRows.length);
      setHasMore(nextRows.length === PAGE_SIZE);
    }
    setRowsLoading(false);
  }, [selectedTopic, reviewFilter, search, offset]);

  useEffect(() => { void loadCounts(); }, [loadCounts]);
  useEffect(() => { setSelected(new Set()); void loadRows(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedTopic, reviewFilter, search]);

  const allVisibleSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
  function toggleAll() {
    setSelected(prev => allVisibleSelected ? new Set() : new Set(rows.map(r => r.id)));
  }
  function toggleOne(id: string) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function approveIds(ids: string[]) {
    if (!ids.length || busy) return;
    setBusy(true); setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("question_bank").update({ needs_review: false }).in("id", ids);
    setBusy(false);
    if (error) { setMessage("Could not approve: " + error.message); return; }
    setMessage(`Approved ${ids.length} question${ids.length === 1 ? "" : "s"}.`);
    setSelected(new Set());
    await loadRows(true);
    await loadCounts();
  }

  async function rejectIds(ids: string[]) {
    if (!ids.length || busy) return;
    setBusy(true); setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("question_bank").delete().in("id", ids);
    setBusy(false);
    if (error) { setMessage("Could not remove: " + error.message); return; }
    setMessage(`Removed ${ids.length} question${ids.length === 1 ? "" : "s"}.`);
    setSelected(new Set());
    await loadRows(true);
    await loadCounts();
  }

  async function approveAllMatchingFilter() {
    if (busy) return;
    const count = selectedTopic ? (topicCounts[selectedTopic] || 0) : totalNeedsReview;
    const confirmed = window.confirm(`Approve all ${count.toLocaleString()} needs-review question(s)${selectedTopic ? ` in ${selectedTopic}` : ""}? They'll immediately become pickable in Quiz Plans.`);
    if (!confirmed) return;
    setBusy(true); setMessage("");
    const supabase = createSupabaseBrowserClient();
    let query = supabase.from("question_bank").update({ needs_review: false }).eq("needs_review", true);
    if (selectedTopic) query = query.eq("topic", selectedTopic);
    const { error } = await query;
    setBusy(false);
    if (error) { setMessage("Could not bulk approve: " + error.message); return; }
    setMessage(`Approved all matching questions${selectedTopic ? ` in ${selectedTopic}` : ""}.`);
    await loadRows(true);
    await loadCounts();
  }

  const typeLabel = useMemo(() => ({ multiple_choice: "Multiple choice", text_answer: "Text", number: "Number", sequence: "Sequence" } as Record<string, string>), []);

  if (loading) return <HostShell><main style={{ minHeight: "100vh", background: BG, display: "grid", placeItems: "center" }}><HostLoading title="Question Library" note="Loading topics…" /></main></HostShell>;

  return <HostShell><main className="qi-bo-page" style={{ background: BG, minHeight: "100vh" }}>
    <header className="qi-bo-pagehead">
      <div>
        <p>Question Library</p>
        <h1>Review &amp; Search</h1>
        <span>{totalNeedsReview.toLocaleString()} questions waiting for review across your imported archive.</span>
      </div>
      <div className="qi-bo-page-actions">
        <Link className="fbh-btn" href="/host/quizzes">Quiz Plans</Link>
        <Link className="fbh-btn" href="/host/rounds">Round Library</Link>
      </div>
    </header>

    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 20 }}>
      <button
        onClick={() => setSelectedTopic(null)}
        style={{ textAlign: "left", padding: "14px 16px", borderRadius: 12, background: selectedTopic === null ? "rgba(190,38,193,0.22)" : "#150A2E", border: `1px solid ${selectedTopic === null ? "#BE26C1" : "#2E1A52"}`, cursor: "pointer" }}
      >
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>All topics</div>
        <div style={{ color: "#B9A8D9", fontSize: 13, marginTop: 4 }}>{totalNeedsReview.toLocaleString()} to review</div>
      </button>
      {TOPICS.map(topic => (
        <button
          key={topic}
          onClick={() => setSelectedTopic(topic)}
          style={{ textAlign: "left", padding: "14px 16px", borderRadius: 12, background: selectedTopic === topic ? "rgba(190,38,193,0.22)" : "#150A2E", border: `1px solid ${selectedTopic === topic ? "#BE26C1" : "#2E1A52"}`, cursor: "pointer" }}
        >
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{topic}</div>
          <div style={{ color: "#B9A8D9", fontSize: 13, marginTop: 4 }}>{(topicCounts[topic] || 0).toLocaleString()} to review</div>
        </button>
      ))}
    </section>

    <section style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
      <input style={{ ...field, flex: 1, minWidth: 220 }} placeholder="Search question or answer text…" value={search} onChange={e => setSearch(e.target.value)} />
      <select style={field} value={reviewFilter} onChange={e => setReviewFilter(e.target.value as ReviewFilter)}>
        <option value="needs_review">Needs review</option>
        <option value="approved">Approved</option>
        <option value="all">All</option>
      </select>
      {reviewFilter === "needs_review" && (
        <button className="fbh-btn pri" disabled={busy} onClick={approveAllMatchingFilter}>
          Approve all {selectedTopic ? `in ${selectedTopic}` : ""} ({(selectedTopic ? topicCounts[selectedTopic] || 0 : totalNeedsReview).toLocaleString()})
        </button>
      )}
    </section>

    {message && <div className="fbh-panel" role="status" style={{ color: "#2EE06E", marginBottom: 12 }}>{message}</div>}

    {selected.size > 0 && (
      <section style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, padding: 10, borderRadius: 10, background: "rgba(190,38,193,0.12)", border: "1px solid #BE26C1" }}>
        <span style={{ color: "#fff", fontWeight: 600 }}>{selected.size} selected</span>
        <button className="fbh-btn pri" disabled={busy} onClick={() => approveIds(Array.from(selected))}>Approve selected</button>
        <button className="fbh-btn" disabled={busy} onClick={() => rejectIds(Array.from(selected))}>Remove selected</button>
      </section>
    )}

    <section style={{ border: "1px solid #2E1A52", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 220px 140px 90px", gap: 10, padding: "10px 14px", background: "#150A2E", color: "#B9A8D9", fontSize: 12, fontWeight: 700 }}>
        <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all visible" />
        <span>Question</span>
        <span>Answer</span>
        <span>Type</span>
        <span></span>
      </div>
      {rows.length === 0 && !rowsLoading && (
        <div style={{ padding: 30, textAlign: "center", color: "#B9A8D9" }}>No questions match this filter.</div>
      )}
      {rows.map(row => (
        <div key={row.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr 220px 140px 90px", gap: 10, padding: "12px 14px", borderTop: "1px solid #2E1A52", alignItems: "start" }}>
          <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleOne(row.id)} aria-label="Select question" />
          <div>
            <div style={{ color: "#fff", fontSize: 14 }}>{row.question_text}</div>
            {row.review_note && <div style={{ color: "#FFC533", fontSize: 12, marginTop: 4 }}>⚠ {row.review_note}</div>}
          </div>
          <div style={{ color: "#B9A8D9", fontSize: 14 }}>{row.correct_answer}</div>
          <div style={{ color: "#B9A8D9", fontSize: 13 }}>{typeLabel[row.question_type] || row.question_type}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {row.needs_review ? (
              <button className="fbh-btn" disabled={busy} onClick={() => approveIds([row.id])} style={{ fontSize: 12, padding: "6px 8px" }}>Approve</button>
            ) : (
              <span style={{ color: "#2EE06E", fontSize: 12 }}>Approved</span>
            )}
            <button className="fbh-btn" disabled={busy} onClick={() => rejectIds([row.id])} style={{ fontSize: 12, padding: "6px 8px" }}>Remove</button>
          </div>
        </div>
      ))}
    </section>

    {hasMore && (
      <div style={{ textAlign: "center", marginTop: 16 }}>
        <button className="fbh-btn" disabled={rowsLoading} onClick={() => loadRows(false)}>{rowsLoading ? "Loading…" : "Load more"}</button>
      </div>
    )}
  </main></HostShell>;
}
