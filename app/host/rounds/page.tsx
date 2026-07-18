"use client";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { HostShell, HostButton, HostLoading, HostEmpty, TopSpacer } from "@/components/fable/HostConsole";

const STAGE_BG = "radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118";

type Question = {
  question_text: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_answer: string;
  explanation?: string;
  difficulty: string;
  round_type: string;
};

type Round = {
  id: string;
  name: string;
  round_type: string;
  difficulty: string;
  created_at: string;
  questions: Question[];
  hide_leaderboard: boolean;
  allow_power_cards: boolean;
};

const typeLabel: Record<string,string> = { multiple_choice:"Multiple Choice", text_answer:"Text Answer", number:"Number", sequence:"Sequence" };

const ROUND_LAUNCHER_TYPES: { key: string; label: string }[] = [
  { key: "regular",   label: "General Knowledge" },
  { key: "bonus",     label: "Bonus / Themed" },
  { key: "music",     label: "Music" },
  { key: "multi_tap", label: "Multi Tap" },
  { key: "pursuit",   label: "The Pursuit" },
];

const selectStyle: React.CSSProperties = { flex: 1, padding: "9px 12px", borderRadius: 14, background: "#150A2E", color: "#fff", border: "1px solid #2E1A52", fontSize: 13, fontFamily: "'Inter',sans-serif", minWidth: 0, outline: "none" };

export default function RoundsPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRound, setOpenRound] = useState<Round | null>(null);
  const [status, setStatus] = useState("");
  const [cardSelections, setCardSelections] = useState<Record<string,string>>({});

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.from("rounds").select("*").order("created_at", { ascending: false });
      if (!error && data) setRounds(data);
      setLoading(false);
    })();
  }, []);

  async function deleteRound(id: string) {
    if (!confirm("Delete this round?")) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("rounds").delete().eq("id", id);
    setRounds(prev => prev.filter(r => r.id !== id));
    if (openRound?.id === id) setOpenRound(null);
    setCardSelections(prev => {
      const next = { ...prev };
      for (const k of Object.keys(next)) if (next[k] === id) delete next[k];
      return next;
    });
  }

  async function duplicateRound(round: Round) {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.from("rounds").insert({
      name: round.name + " (Copy)",
      round_type: round.round_type,
      difficulty: round.difficulty,
      questions: round.questions,
      hide_leaderboard: round.hide_leaderboard ?? false,
      allow_power_cards: round.allow_power_cards ?? true,
    }).select().single();
    if (!error && data) {
      setRounds(prev => [data, ...prev]);
      setStatus("Round duplicated!");
      setTimeout(() => setStatus(""), 2000);
    }
  }

  async function updateRoundBehaviour(id: string, field: "hide_leaderboard" | "allow_power_cards", value: boolean) {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("rounds").update({ [field]: value }).eq("id", id);
    if (error) {
      setStatus("Could not update round settings: " + error.message);
      return;
    }
    const apply = (round: Round) => round.id === id ? { ...round, [field]: value } : round;
    setRounds(prev => prev.map(apply));
    setOpenRound(prev => prev ? apply(prev) : prev);
    setStatus("Round behaviour updated");
    setTimeout(() => setStatus(""), 2000);
  }

  async function sendToBank(roundId: string, qIdx: number) {
    if (!openRound) return;
    const q = openRound.questions[qIdx];
    const supabase = createSupabaseBrowserClient();
    await supabase.from("question_bank").insert({
      question_text: q.question_text, question_type: q.question_type,
      option_a: q.option_a, option_b: q.option_b,
      option_c: q.option_c, option_d: q.option_d,
      correct_answer: q.correct_answer, difficulty: q.difficulty, round_type: q.round_type,
    });
    const newQs = openRound.questions.filter((_, i) => i !== qIdx);
    const updated = { ...openRound, questions: newQs };
    await supabase.from("rounds").update({ questions: newQs }).eq("id", roundId);
    setOpenRound(updated);
    setRounds(prev => prev.map(r => r.id === roundId ? updated : r));
    setStatus("Question moved to bank!");
    setTimeout(() => setStatus(""), 2000);
  }

  return (
    <HostShell>
      <div style={{ minHeight: "100vh", background: STAGE_BG, color: "#fff", padding: "24px", maxWidth: 980, margin: "0 auto" }}>
        {/* TOP BAR */}
        <div className="fbh-top" style={{ border: "1px solid #2E1A52", borderRadius: 16, marginBottom: 20 }}>
          <span className="fbh-wm" style={{ fontSize: 16 }}><span className="q">QUIZ-</span>IT</span>
          <span className="fbh-bc">Round Library</span>
          <TopSpacer />
          <a className="fbh-btn" href="/host/events">Events</a>
          <a className="fbh-btn" href="/host/music-prep">Music Prep</a>
          <a className="fbh-btn" href="/host/question-bank">Question Bank</a>
          <a className="fbh-btn" href="/host/quizzes">Quiz Plans</a>
          <a className="fbh-btn pri" href="/host/questions">+ New Round</a>
        </div>

        {status && <p style={{ textAlign: "center", color: "#D94FDC", font: "600 13px 'Inter'", marginBottom: 16 }}>{status}</p>}
        {loading && <HostLoading title="Round Library" note="Loading your rounds…" />}
        {!loading && rounds.length === 0 && (
          <HostEmpty title="No Rounds Yet" note="Generate your first round to build tonight's show." actionLabel="+ NEW ROUND" onAction={() => { window.location.href = "/host/questions"; }} />
        )}

        {/* LAUNCHER CARDS (by type) */}
        {!openRound && rounds.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 24 }}>
            {ROUND_LAUNCHER_TYPES.map(rt => {
              const roundsOfType = rounds.filter(r => r.round_type === rt.key);
              const selectedId = cardSelections[rt.key] || "";
              const selectedRound = roundsOfType.find(r => r.id === selectedId) || null;
              return (
                <div key={rt.key} className="fbh-panel" style={{ marginBottom: 0 }}>
                  <div style={{ font: "800 14px 'Inter'", letterSpacing: "0.02em", marginBottom: 10 }}>{rt.label}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select
                      value={selectedId}
                      onChange={e => {
                        const id = e.target.value;
                        setCardSelections(prev => ({ ...prev, [rt.key]: id }));
                        const found = roundsOfType.find(r => r.id === id);
                        if (found) setOpenRound(found);
                      }}
                      style={selectStyle}
                    >
                      <option value="">— select round —</option>
                      {roundsOfType.map(r => (
                        <option key={r.id} value={r.id}>{r.name} ({r.questions?.length || 0}q)</option>
                      ))}
                    </select>
                    <HostButton onClick={() => selectedRound && duplicateRound(selectedRound)} disabled={!selectedRound} title="Duplicate selected round" style={{ height: 42, padding: "0 12px" }}>Copy</HostButton>
                    <HostButton onClick={() => selectedRound && deleteRound(selectedRound.id)} disabled={!selectedRound} title="Delete selected round" style={{ height: 42, padding: "0 12px" }}>Del</HostButton>
                  </div>
                  {roundsOfType.length === 0 && (
                    <div style={{ font: "400 11.5px 'Inter'", color: "#6B5A8E", marginTop: 8 }}>No {rt.label.toLowerCase()} rounds saved yet</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ALL ROUNDS */}
        {!openRound && rounds.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div className="fbh-lbl">All Rounds</div>
            {rounds.map(r => (
              <div key={r.id} className="fbh-panel">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: "700 15px 'Inter'", marginBottom: 4 }}>{r.name}</div>
                    <div style={{ font: "400 12px 'Inter'", color: "#6B5A8E" }}>{r.questions?.length || 0} questions · {r.round_type} · {r.difficulty} · {new Date(r.created_at).toLocaleDateString()}</div>
                  </div>
                  <HostButton onClick={() => setOpenRound(r)} style={{ height: 36 }}>View</HostButton>
                  <HostButton onClick={() => duplicateRound(r)} style={{ height: 36 }}>Duplicate</HostButton>
                  <HostButton onClick={() => deleteRound(r.id)} style={{ height: 36 }}>Delete</HostButton>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ROUND DETAIL */}
        {openRound && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <HostButton onClick={() => setOpenRound(null)} style={{ height: 36 }}>Back</HostButton>
              <div style={{ font: "800 18px 'Inter'" }}>{openRound.name}</div>
              <div style={{ font: "400 12px 'Inter'", color: "#6B5A8E" }}>{openRound.questions.length} questions</div>
            </div>
            <div className="fbh-panel" style={{ display: "grid", gap: 14 }}>
              <div>
                <div style={{ font: "800 14px 'Inter'", marginBottom: 4 }}>Round behaviour</div>
                <div style={{ font: "400 12px 'Inter'", color: "#B9A8D9" }}>These rules apply whenever this round is selected. They do not change scoring.</div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                <input type="checkbox" checked={openRound.hide_leaderboard ?? false} onChange={e => updateRoundBehaviour(openRound.id, "hide_leaderboard", e.target.checked)} />
                <span><strong style={{ display: "block", font: "700 13px 'Inter'" }}>Hide leaderboard during this round</strong><small style={{ color: "#6B5A8E" }}>Prevents host, display and handset leaderboard surfaces until the quiz finale.</small></span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                <input type="checkbox" checked={openRound.allow_power_cards ?? true} onChange={e => updateRoundBehaviour(openRound.id, "allow_power_cards", e.target.checked)} />
                <span><strong style={{ display: "block", font: "700 13px 'Inter'" }}>Allow Power Cards during this round</strong><small style={{ color: "#6B5A8E" }}>When disabled, unused cards stay available for a later round.</small></span>
              </label>
            </div>
            {openRound.questions.map((q, i) => (
              <div key={i} className="fbh-panel">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  <span style={{ color: "#6B5A8E", font: "700 13px 'Inter'" }}>{i + 1}.</span>
                  <span className="fbh-chip">{typeLabel[q.question_type] || q.question_type}</span>
                  <span style={{ font: "400 11px 'Inter'", color: "#6B5A8E" }}>{q.difficulty}</span>
                  <div style={{ flex: 1 }} />
                  <HostButton onClick={() => sendToBank(openRound.id, i)} style={{ height: 32, padding: "0 12px" }}>Move to Bank</HostButton>
                </div>
                <p style={{ font: "600 15px 'Inter'", marginBottom: 8, lineHeight: 1.5 }}>{q.question_text}</p>
                {q.question_type === "multiple_choice" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {(["a", "b", "c", "d"] as const).map(l => (
                      <div key={l} style={{ font: "600 13px 'Inter'", padding: "6px 10px", borderRadius: 8, background: l === q.correct_answer ? "rgba(46,224,110,0.15)" : "#150A2E", color: l === q.correct_answer ? "#2EE06E" : "#B9A8D9", border: l === q.correct_answer ? "1px solid rgba(46,224,110,0.4)" : "1px solid #2E1A52" }}>
                        <span style={{ color: "#BE26C1", fontWeight: 700, marginRight: 6 }}>{l.toUpperCase()}.</span>{(q as Record<string, string | null>)[("option_" + l)] as string}
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
                {q.explanation && (
                  <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 10, background: "rgba(190,38,193,0.08)", borderLeft: "3px solid rgba(190,38,193,0.4)" }}>
                    <p style={{ font: "400 12px 'Inter'", color: "#D94FDC", margin: 0 }}>{q.explanation}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </HostShell>
  );
}
