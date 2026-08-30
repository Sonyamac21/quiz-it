"use client";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { HostShell, HostButton, HostLoading, HostEmpty, TopSpacer } from "@/components/fable/HostConsole";
import { useConfirmDialog, usePromptDialog } from "@/components/ui/quiz-it-ui";

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
  points_per_question: number | null;
  // Rounds generated inside a Quiz Plan get auto-synced here, filed under
  // the parent Quiz Plan's name so they don't flood the main list. Rounds
  // created directly in the Round Library have no folder and keep showing
  // in "All Rounds" exactly as before.
  folder: string | null;
  synced_from_quiz_round_id: string | null;
};

const typeLabel: Record<string,string> = { multiple_choice:"Multiple Choice", text_answer:"Text Answer", number:"Number", sequence:"Sequence" };

const ROUND_LAUNCHER_TYPES: { key: string; label: string }[] = [
  { key: "regular",   label: "General Knowledge" },
  { key: "bonus",     label: "Bonus / Themed" },
  { key: "music",     label: "Music" },
  { key: "multi_tap", label: "TapType" },
  { key: "pursuit",   label: "The Pursuit" },
  { key: "hot_seat",  label: "Hot Seat" },
];

const selectStyle: React.CSSProperties = { flex: 1, padding: "9px 12px", borderRadius: 14, background: "#150A2E", color: "#fff", border: "1px solid #2E1A52", fontSize: 13, fontFamily: "'Inter',sans-serif", minWidth: 0, outline: "none" };

export default function RoundsPage() {
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirmDialog();
  const { promptDialog, dialog: promptDialogEl } = usePromptDialog();
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

  async function moveRoundToFolder(round: Round) {
    const input = await promptDialog(
      `Move "${round.name}" to which folder? Leave blank for no folder (shows in All Rounds).`,
      round.folder || "",
      { title: "Move round", confirmLabel: "Move", placeholder: "Folder name" }
    );
    if (input === null) return;
    const folder = input.trim() || null;
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("rounds").update({ folder }).eq("id", round.id);
    if (error) {
      setStatus("Could not move round: " + error.message);
      return;
    }
    const apply = (r: Round) => r.id === round.id ? { ...r, folder } : r;
    setRounds(prev => prev.map(apply));
    setOpenRound(prev => prev ? apply(prev) : prev);
    setStatus(folder ? "Moved to \"" + folder + "\"" : "Moved to All Rounds");
    setTimeout(() => setStatus(""), 2000);
  }
  async function deleteRound(id: string) {
    if (!await confirmDialog("Delete this round?", { tone: "destructive", confirmLabel: "Delete" })) return;
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
      points_per_question: round.points_per_question ?? null,
    }).select().single();
    if (!error && data) {
      setRounds(prev => [data, ...prev]);
      setStatus("Round duplicated!");
      setTimeout(() => setStatus(""), 2000);
    }
  }

  async function updateRoundPoints(id: string, value: number | null) {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("rounds").update({ points_per_question: value }).eq("id", id);
    if (error) {
      setStatus("Could not update round points: " + error.message);
      return;
    }
    const apply = (round: Round) => round.id === id ? { ...round, points_per_question: value } : round;
    setRounds(prev => prev.map(apply));
    setOpenRound(prev => prev ? apply(prev) : prev);
    setStatus("Round points updated");
    setTimeout(() => setStatus(""), 2000);
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
      {confirmDialogEl}
      {promptDialogEl}
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
          <a className="fbh-btn pri" href="/host/questions">Generate Questions</a>
        </div>

        <p style={{ font: "400 13px 'Inter'", color: "#8D7AAE", marginBottom: 18, lineHeight: 1.5 }}>
          Individual rounds live here. To build a full night's running order (and assign it to a date), combine rounds into a <a href="/host/quizzes" style={{ color: "#D94FDC" }}>Quiz Plan</a>.
        </p>
        {status && <p style={{ textAlign: "center", color: "#D94FDC", font: "600 13px 'Inter'", marginBottom: 16 }}>{status}</p>}
        {loading && <HostLoading title="Round Library" note="Loading your rounds…" />}
        {!loading && rounds.length === 0 && (
          <HostEmpty title="No Rounds Yet" note="Generate your first round to build tonight's show." actionLabel="+ NEW ROUND" onAction={() => { window.location.href = "/host/questions"; }} />
        )}

        {/* ALL ROUNDS - unfiled (created directly here, or never moved into a folder) */}
        {!openRound && rounds.length > 0 && (() => {
          const unfiled = rounds.filter(r => !r.folder);
          const folderNames = Array.from(new Set(rounds.filter(r => r.folder).map(r => r.folder as string))).sort();
          const roundRow = (r: Round) => (
            <div key={r.id} className="fbh-panel">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ font: "700 15px 'Inter'", marginBottom: 4 }}>{r.name}</div>
                  <div style={{ font: "400 12px 'Inter'", color: "#6B5A8E" }}>{r.questions?.length || 0} questions · {r.round_type} · {r.difficulty} · {new Date(r.created_at).toLocaleDateString()}</div>
                </div>
                <HostButton onClick={() => setOpenRound(r)} style={{ height: 36 }}>View</HostButton>
                <HostButton onClick={() => moveRoundToFolder(r)} style={{ height: 36 }}>Move</HostButton>
                <HostButton onClick={() => duplicateRound(r)} style={{ height: 36 }}>Duplicate</HostButton>
                <HostButton onClick={() => deleteRound(r.id)} style={{ height: 36 }}>Delete</HostButton>
              </div>
            </div>
          );
          return (
            <div style={{ marginTop: 8 }}>
              <div className="fbh-lbl">All Rounds</div>
              {unfiled.length === 0 && <p style={{ font: "400 12px 'Inter'", color: "#6B5A8E" }}>Nothing unfiled - everything below is tucked into a folder.</p>}
              {unfiled.map(roundRow)}
              {folderNames.map(folder => {
                const inFolder = rounds.filter(r => r.folder === folder);
                return (
                  <details key={folder} style={{ marginTop: 14 }}>
                    <summary style={{ cursor: "pointer", font: "700 13px 'Inter'", color: "#D94FDC", padding: "8px 2px" }}>{folder} ({inFolder.length})</summary>
                    <div style={{ marginTop: 6 }}>{inFolder.map(roundRow)}</div>
                  </details>
                );
              })}
            </div>
          );
        })()}

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
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <input
                  type="number"
                  min={0}
                  value={openRound.points_per_question ?? ""}
                  placeholder="10"
                  onChange={e => {
                    const raw = e.target.value;
                    updateRoundPoints(openRound.id, raw === "" ? null : Number(raw));
                  }}
                  style={{ width: 70, padding: "6px 8px", borderRadius: 10, background: "#0A0118", color: "#fff", border: "1px solid #2E1A52", font: "600 14px 'Inter'", textAlign: "center" as const }}
                />
                <span><strong style={{ display: "block", font: "700 13px 'Inter'" }}>Points per question</strong><small style={{ color: "#6B5A8E" }}>Auto-loads on the host console when this round starts. Leave blank to use the session default (10), and it can still be overridden live.</small></span>
              </div>
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
