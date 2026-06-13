"use client";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
};

function parseTimestamp(ts: string): number {
  const parts = ts.trim().split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

function getVideoId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[?&]v=([^&]+)/);
  return m ? m[1] : null;
}

function buildYouTubeUrl(url: string | null, timestamp: string): string {
  const videoId = getVideoId(url);
  if (!videoId) return url || "";
  const secs = parseTimestamp(timestamp);
  return secs > 0
    ? "https://www.youtube.com/watch?v=" + videoId + "&t=" + secs + "s"
    : "https://www.youtube.com/watch?v=" + videoId;
}

export default function MusicPrepPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRound, setOpenRound] = useState<Round | null>(null);
  const [timestamps, setTimestamps] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => { loadRounds(); }, []);

  async function loadRounds() {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("rounds")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) {
      const musicRounds = data.filter((r: Round) =>
        r.questions?.some((q: Question) => q.question_type === "audio")
      );
      setRounds(musicRounds);
    }
    setLoading(false);
  }

  function openForPrep(round: Round) {
    setOpenRound(round);
    const initial: Record<number, string> = {};
    round.questions.forEach((q, i) => {
      if (q.question_type === "audio" && q.option_b) {
        const m = q.option_b.match(/[?&]t=(\d+)s/);
        if (m) {
          const secs = parseInt(m[1]);
          initial[i] = Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
        }
      }
    });
    setTimestamps(initial);
  }

  async function saveTimestamps() {
    if (!openRound) return;
    setSaving(true);
    const updatedQuestions = openRound.questions.map((q, i) => {
      if (q.question_type !== "audio") return q;
      const ts = timestamps[i] || "";
      const newUrl = buildYouTubeUrl(q.option_b, ts);
      return { ...q, option_b: newUrl };
    });
    const supabase = createSupabaseBrowserClient();
    await supabase.from("rounds").update({ questions: updatedQuestions }).eq("id", openRound.id);
    setOpenRound({ ...openRound, questions: updatedQuestions });
    setRounds(prev => prev.map(r => r.id === openRound.id ? { ...r, questions: updatedQuestions } : r));
    setSaving(false);
    setStatus("Saved! Timestamps locked in.");
    setTimeout(() => setStatus(""), 3000);
  }

  const audioIndices = openRound?.questions.map((q, i) => q.question_type === "audio" ? i : -1).filter(i => i >= 0) || [];

  return (
    <div style={{ minHeight: "100vh", background: "#07030f", color: "#fff", padding: "24px", fontFamily: "sans-serif", maxWidth: "960px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#1a0530", border: "2px solid #BE26C1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#BE26C1", fontWeight: 700 }}>ME</div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#BE26C1", letterSpacing: 4 }}>Music Prep</div>
          <div style={{ fontSize: 11, color: "rgba(190,38,193,0.6)", letterSpacing: 2 }}>Set hook timestamps for Name That Tune</div>
        </div>
        <div style={{ flex: 1 }} />
        <a href="/host/rounds" style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(190,38,193,0.4)", color: "#BE26C1", textDecoration: "none", fontSize: 12, letterSpacing: 2 }}>Round Library</a>
      </div>

      {status && <p style={{ textAlign: "center", color: "#22c55e", fontSize: 13, marginBottom: 16, letterSpacing: 2 }}>{status}</p>}
      {loading && <p style={{ textAlign: "center", color: "#666" }}>Loading music rounds...</p>}
      {!loading && rounds.length === 0 && (
        <div style={{ textAlign: "center", color: "#666", marginTop: 60 }}>
          <p>No music rounds found. Generate a Music round first!</p>
          <a href="/host/questions" style={{ display: "inline-block", marginTop: 16, padding: "10px 24px", borderRadius: 8, background: "#BE26C1", color: "#fff", textDecoration: "none", fontSize: 13 }}>Generate Music Round</a>
        </div>
      )}

      {!openRound && rounds.map(r => (
        <div key={r.id} style={{ background: "#0d0520", border: "1px solid rgba(190,38,193,0.25)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{r.name}</div>
              <div style={{ fontSize: 12, color: "#666" }}>
                {r.questions?.filter(q => q.question_type === "audio").length} audio questions · {new Date(r.created_at).toLocaleDateString()}
              </div>
            </div>
            <button onClick={() => openForPrep(r)} style={{ padding: "8px 20px", borderRadius: 8, background: "#BE26C1" border: "none", color: "#fff", cursor: "pointer", fontSize: 13, letterSpacing: 2 }}>Prep</button>
          </div>
        </div>
      ))}

      {openRound && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <button onClick={() => setOpenRound(null)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#aaa", cursor: "pointer", fontSize: 12 }}>Back</button>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{openRound.name}</div>
          </div>

          <div style={{ background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "rgba(251,146,60,0.9)", lineHeight: 1.6 }}>
            For each song: click Preview to watch it, find the hook, note the timestamp, type it in below. Format: 0:32 or 1:15. Then hit Save.
          </div>

          {audioIndices.map((qIdx, n) => {
            const q = openRound.questions[qIdx];
            const videoId = getVideoId(q.option_b);
            const currentTs = timestamps[qIdx] || "";
            const previewUrl = videoId
              ? "https://www.youtube.com/watch?v=" + videoId + (currentTs ? "&t=" + parseTimestamp(currentTs) + "s" : "")
              : null;

            return (
              <div key={qIdx} style={{ background: "#0d0520", border: "1px solid rgba(251,146,60,0.2)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ background: "#1a0a00", color: "#fb923c", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>Name That Tune {n + 1}</span>
                </div>
                <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, lineHeight: 1.5 }}>{q.question_text}</p>
                <p style={{ fontSize: 13, color: "#22c55e", fontWeight: 600, marginBottom: 12 }}>Answer: {q.correct_answer}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  {previewUrl ? (
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 8, background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.4)", color: "#fb923c", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
                      Preview on YouTube
                    </a>
                  ) : (
                    <span style={{ fontSize: 12, color: "#555", fontStyle: "italic" }}>No YouTube link — regenerate this question</span>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: 11, color: "rgba(190,38,193,0.6)", letterSpacing: 2 }}>HOOK AT</label>
                    <input
                    value={currentTs}
                      onChange={e => setTimestamps(prev => ({ ...prev, [qIdx]: e.target.value }))}
                      placeholder="0:32"
                      style={{ width: 70, padding: "6px 10px", borderRadius: 8, background: "#0f0f1a", color: "#fff", border: "1px solid rgba(190,38,193,0.4)", fontSize: 14, textAlign: "center", outline: "none" }}
                    />
                  </div>
                  {currentTs && parseTimestamp(currentTs) > 0 && (
                    <span style={{ fontSize: 12, color: "#22c55e" }}>Will start at {currentTs}</span>
                  )}
                </div>
              </div>
            );
          })}

          <button onClick={saveTimestamps} disabled={saving} style={{ width: "100%", padding: 14, borderRadius: 8, background: "#BE26C1", color: "#fff", border: "none", fontSize: 16, letterSpacing: 4, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, marginTop: 8 }}>
            {saving ? "Saving..." : "Save All Timestamps"}
          </button>
        </div>
      )}
    </div>
  );
}
