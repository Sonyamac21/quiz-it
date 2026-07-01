"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { encodeWavFromBuffer, sliceAudioBuffer } from "@/lib/audio/wavEncoder";

const purple = "#BE26C1";
const WAVEFORM_BUCKETS = 300;

type Question = {
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

type Round = {
  id: string;
  name: string;
  round_type: string;
  questions: Question[];
  created_at: string;
};

type Candidate = {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration_seconds: number;
  duration_formatted: string;
  preview_url: string;
  cover: string;
};

type QuestionState = {
  phase: "idle" | "searching" | "candidates" | "loading_audio" | "trim" | "saving" | "done";
  candidates: Candidate[];
  selectedCandidate: Candidate | null;
  audioBuffer: AudioBuffer | null;
  peaks: number[];
  clipStart: number;
  clipEnd: number;
  savedUrl: string | null;
  error: string;
};

function fmtTime(t: number) {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

function computePeaks(buffer: AudioBuffer): number[] {
  const data = buffer.getChannelData(0);
  const bucketSize = Math.floor(data.length / WAVEFORM_BUCKETS);
  const result: number[] = [];
  for (let i = 0; i < WAVEFORM_BUCKETS; i++) {
    let max = 0;
    const start = i * bucketSize;
    for (let j = start; j < start + bucketSize && j < data.length; j++) {
      const v = Math.abs(data[j]);
      if (v > max) max = v;
    }
    result.push(max);
  }
  return result;
}

function WaveformEditor({
  audioBuffer, peaks, clipStart, clipEnd,
  onStartChange, onEndChange, onSave, onDiscard, saving,
}: {
  audioBuffer: AudioBuffer; peaks: number[]; clipStart: number; clipEnd: number;
  onStartChange: (v: number) => void; onEndChange: (v: number) => void;
  onSave: () => void; onDiscard: () => void; saving: boolean;
}) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!dragging || !waveformRef.current) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = ratio * audioBuffer.duration;
    if (dragging === "start") onStartChange(Math.min(time, clipEnd - 0.5));
    else onEndChange(Math.max(time, clipStart + 0.5));
  }, [dragging, audioBuffer.duration, clipStart, clipEnd, onStartChange, onEndChange]);

  useEffect(() => {
    if (!dragging) return;
    const up = () => setDragging(null);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", handlePointerMove); window.removeEventListener("pointerup", up); };
  }, [dragging, handlePointerMove]);

  function stopPreview() {
    try { sourceRef.current?.stop(); } catch { /* ok */ }
    sourceRef.current = null;
    setPreviewing(false);
  }

  function playPreview() {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AC();
    }
    stopPreview();
    const src = audioCtxRef.current.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(audioCtxRef.current.destination);
    src.start(0, clipStart, clipEnd - clipStart);
    src.onended = () => setPreviewing(false);
    sourceRef.current = src;
    setPreviewing(true);
  }

  const startPct = (clipStart / audioBuffer.duration) * 100;
  const endPct = (clipEnd / audioBuffer.duration) * 100;
  const clipDuration = clipEnd - clipStart;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
        Drag handles to select your clip — <strong style={{ color: "#fff" }}>{fmtTime(clipDuration)}</strong> selected
      </div>

      <div ref={waveformRef} style={{ position: "relative", height: 80, borderRadius: 10, background: "rgba(0,0,0,0.4)", overflow: "hidden", userSelect: "none", cursor: "crosshair" }}>
        <svg width="100%" height="80" viewBox={`0 0 ${WAVEFORM_BUCKETS} 80`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
          {peaks.map((p, i) => (
            <rect key={i} x={i} y={40 - p * 38} width={0.8} height={Math.max(1, p * 76)}
              fill={i / WAVEFORM_BUCKETS >= startPct / 100 && i / WAVEFORM_BUCKETS <= endPct / 100
                ? "rgba(190,38,193,0.9)" : "rgba(255,255,255,0.15)"} />
          ))}
        </svg>
        {/* Dim regions outside selection */}
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: startPct + "%", background: "rgba(0,0,0,0.55)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 0, right: 0, height: "100%", width: (100 - endPct) + "%", background: "rgba(0,0,0,0.55)", pointerEvents: "none" }} />
        {/* Start handle */}
        <div onPointerDown={() => setDragging("start")} style={{ position: "absolute", top: 0, left: startPct + "%", transform: "translateX(-50%)", height: "100%", width: 16, cursor: "ew-resize", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 4, height: "100%", background: "#fff", borderRadius: 2, boxShadow: "0 0 8px rgba(255,255,255,0.8)" }} />
        </div>
        {/* End handle */}
        <div onPointerDown={() => setDragging("end")} style={{ position: "absolute", top: 0, left: endPct + "%", transform: "translateX(-50%)", height: "100%", width: 16, cursor: "ew-resize", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 4, height: "100%", background: "#fff", borderRadius: 2, boxShadow: "0 0 8px rgba(255,255,255,0.8)" }} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
        <span>{fmtTime(clipStart)}</span>
        <span>{fmtTime(audioBuffer.duration)}</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={previewing ? stopPreview : playPreview}
          style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(56,189,248,0.2)", border: "1px solid #38bdf8", color: "#38bdf8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {previewing ? "⏹ Stop" : "▶ Preview"}
        </button>
        <button type="button" onClick={onSave} disabled={saving}
          style={{ padding: "8px 20px", borderRadius: 8, background: "rgba(34,197,94,0.25)", border: "1px solid #22c55e", color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
          {saving ? "Saving..." : "Save Clip →"}
        </button>
        <button type="button" onClick={onDiscard}
          style={{ padding: "8px 14px", borderRadius: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
          Try different version
        </button>
      </div>
    </div>
  );
}

export default function MusicPrepPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRound, setOpenRound] = useState<Round | null>(null);
  const [questionStates, setQuestionStates] = useState<Record<number, QuestionState>>({});
  const [status, setStatus] = useState("");
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => { loadRounds(); }, []);

  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AC();
    }
    return audioCtxRef.current;
  }

  async function loadRounds() {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.from("rounds").select("*").order("created_at", { ascending: false });
    if (!error && data) {
      setRounds(data.filter((r: Round) => r.questions?.some((q: Question) => q.question_type === "audio")));
    }
    setLoading(false);
  }

  function openForPrep(round: Round) {
    setOpenRound(round);
    const initial: Record<number, QuestionState> = {};
    round.questions.forEach((q, i) => {
      if (q.question_type !== "audio") return;
      const hasSavedClip = q.option_b && q.option_b.includes("blob.vercel-storage.com");
      initial[i] = {
        phase: hasSavedClip ? "done" : "idle",
        candidates: [], selectedCandidate: null,
        audioBuffer: null, peaks: [], clipStart: 0, clipEnd: 0,
        savedUrl: hasSavedClip ? q.option_b : null,
        error: "",
      };
    });
    setQuestionStates(initial);
    // Auto-start search for all unprepared questions
    round.questions.forEach((q, i) => {
      if (q.question_type === "audio" && !(q.option_b && q.option_b.includes("blob.vercel-storage.com"))) {
        setTimeout(() => searchForQuestion(round, i, q.option_a || q.correct_answer), i * 300);
      }
    });
  }

  function setState(qIdx: number, update: Partial<QuestionState>) {
    setQuestionStates(prev => ({ ...prev, [qIdx]: { ...prev[qIdx], ...update } }));
  }

  async function searchForQuestion(round: Round, qIdx: number, query: string) {
    setState(qIdx, { phase: "searching", error: "" });
    try {
      const res = await fetch(`/api/deezer-search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Search failed");
      setState(qIdx, { phase: "candidates", candidates: data.candidates || [] });
    } catch (e) {
      setState(qIdx, { phase: "candidates", candidates: [], error: e instanceof Error ? e.message : "Search failed" });
    }
  }

  async function selectCandidate(round: Round, qIdx: number, candidate: Candidate) {
    setState(qIdx, { phase: "loading_audio", selectedCandidate: candidate, error: "" });
    try {
      const proxyUrl = `/api/deezer-fetch?url=${encodeURIComponent(candidate.preview_url)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`Audio fetch failed (${res.status})`);
      const arrayBuffer = await res.arrayBuffer();
      const ctx = getAudioCtx();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      const peaks = computePeaks(decoded);
      setState(qIdx, {
        phase: "trim",
        audioBuffer: decoded,
        peaks,
        clipStart: 0,
        clipEnd: decoded.duration,
      });
    } catch (e) {
      setState(qIdx, { phase: "candidates", error: e instanceof Error ? e.message : "Failed to load audio" });
    }
  }

  async function saveClip(round: Round, qIdx: number) {
    const qs = questionStates[qIdx];
    if (!qs.audioBuffer || !qs.selectedCandidate) return;
    setState(qIdx, { phase: "saving", error: "" });
    try {
      const sliced = sliceAudioBuffer(qs.audioBuffer, qs.clipStart, qs.clipEnd);
      const wavBlob = encodeWavFromBuffer(sliced);
      const formData = new FormData();
      formData.append("file", wavBlob, "clip.wav");
      const uploadRes = await fetch("/api/upload-audio", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || uploadData.error) throw new Error(uploadData?.error?.message || "Upload failed");

      // Update the question in the round
      const updatedQuestions = round.questions.map((q, i) =>
        i === qIdx ? { ...q, option_b: uploadData.url } : q
      );
      const supabase = createSupabaseBrowserClient();
      await supabase.from("rounds").update({ questions: updatedQuestions }).eq("id", round.id);

      // Log to media_assets
      await supabase.from("media_assets").insert({
        file_name: qs.selectedCandidate.title + ".wav",
        media_type: "audio",
        file_url: uploadData.url,
        file_size: uploadData.fileSize,
        duration_seconds: qs.clipEnd - qs.clipStart,
        clip_start: qs.clipStart,
        clip_end: qs.clipEnd,
        title: qs.selectedCandidate.title,
        artist: qs.selectedCandidate.artist,
        category: "Music Round",
        source_type: "deezer_preview",
      });

      setOpenRound(prev => prev ? { ...prev, questions: updatedQuestions } : null);
      setState(qIdx, { phase: "done", savedUrl: uploadData.url });
      setStatus(`Saved: ${qs.selectedCandidate.title}`);
      setTimeout(() => setStatus(""), 3000);
    } catch (e) {
      setState(qIdx, { phase: "trim", error: e instanceof Error ? e.message : "Save failed" });
    }
  }

  const audioQuestions = openRound?.questions.map((q, i) => ({ q, i })).filter(({ q }) => q.question_type === "audio") || [];

  return (
    <div style={{ minHeight: "100vh", background: "#07030f", color: "#fff", padding: "24px", fontFamily: "sans-serif", maxWidth: "960px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#1a0530", border: `2px solid ${purple}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: purple, fontWeight: 700 }}>ME</div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: purple, letterSpacing: 4 }}>Music Prep</div>
          <div style={{ fontSize: 11, color: "rgba(190,38,193,0.6)", letterSpacing: 2 }}>Deezer · Auto-search · Waveform trim</div>
        </div>
        <div style={{ flex: 1 }} />
        {openRound && <button onClick={() => setOpenRound(null)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#aaa", cursor: "pointer", fontSize: 12 }}>← All Rounds</button>}
        {!openRound && <a href="/host/rounds" style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid rgba(190,38,193,0.4)`, color: purple, textDecoration: "none", fontSize: 12 }}>Round Library</a>}
      </div>

      {status && <div style={{ textAlign: "center", color: "#22c55e", fontSize: 13, marginBottom: 16 }}>{status}</div>}

      {/* Round list */}
      {!openRound && (
        <>
          {loading && <p style={{ textAlign: "center", color: "#666" }}>Loading music rounds...</p>}
          {!loading && rounds.length === 0 && (
            <div style={{ textAlign: "center", color: "#666", marginTop: 60 }}>
              <p>No music rounds found.</p>
              <a href="/host/questions" style={{ display: "inline-block", marginTop: 16, padding: "10px 24px", borderRadius: 8, background: purple, color: "#fff", textDecoration: "none", fontSize: 13 }}>Generate Music Round</a>
            </div>
          )}
          {rounds.map(r => {
            const total = r.questions.filter(q => q.question_type === "audio").length;
            const prepped = r.questions.filter(q => q.question_type === "audio" && q.option_b && q.option_b.includes("blob.vercel-storage.com")).length;
            return (
              <div key={r.id} onClick={() => openForPrep(r)} style={{ background: "#0d0520", border: `1px solid rgba(190,38,193,0.25)`, borderRadius: 12, padding: 16, marginBottom: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>{total} music questions · {prepped}/{total} prepped · {new Date(r.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{ padding: "8px 20px", borderRadius: 8, background: purple, color: "#fff", fontSize: 13, fontWeight: 700 }}>
                  {prepped === total ? "✓ Ready" : "Prep →"}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Question prep */}
      {openRound && audioQuestions.map(({ q, i }, n) => {
        const qs = questionStates[i] || { phase: "idle", candidates: [], error: "" };
        return (
          <div key={i} style={{ background: "#0d0520", border: `1px solid ${qs.phase === "done" ? "rgba(34,197,94,0.4)" : "rgba(190,38,193,0.2)"}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
            {/* Question header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ background: "rgba(190,38,193,0.15)", color: purple, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>Name That Tune {n + 1}</span>
                  {qs.phase === "done" && <span style={{ color: "#22c55e", fontSize: 12, fontWeight: 700 }}>✓ Ready</span>}
                </div>
                <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 4px", lineHeight: 1.5 }}>{q.question_text}</p>
                <p style={{ fontSize: 13, color: "#22c55e", margin: 0 }}>Answer: {q.correct_answer}</p>
              </div>
            </div>

            {/* Phase: searching */}
            {(qs.phase === "idle" || qs.phase === "searching") && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(190,38,193,0.4)", borderTopColor: purple, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                Searching Deezer for "{q.option_a || q.correct_answer}"...
              </div>
            )}

            {/* Phase: loading audio */}
            {qs.phase === "loading_audio" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(190,38,193,0.4)", borderTopColor: purple, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                Loading audio...
              </div>
            )}

            {/* Phase: candidates */}
            {qs.phase === "candidates" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {qs.error && <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>{qs.error}</p>}
                {qs.candidates.length === 0 && !qs.error && (
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>No Deezer results found.</p>
                )}
                {qs.candidates.map((c, ci) => (
                  <button key={c.id} type="button" onClick={() => selectCandidate(openRound, i, c)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", textAlign: "left", width: "100%" }}>
                    {c.cover && <img src={c.cover} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{c.artist} · {c.album} · {c.duration_formatted}</div>
                    </div>
                    <div style={{ flexShrink: 0, fontSize: 12, color: purple, fontWeight: 700 }}>Select →</div>
                  </button>
                ))}
                <button type="button" onClick={() => searchForQuestion(openRound, i, q.option_a || q.correct_answer)}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 11, textDecoration: "underline", cursor: "pointer", alignSelf: "flex-start", padding: 0 }}>
                  Search again
                </button>
              </div>
            )}

            {/* Phase: trim */}
            {qs.phase === "trim" && qs.audioBuffer && (
              <div>
                {qs.selectedCandidate && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    {qs.selectedCandidate.cover && <img src={qs.selectedCandidate.cover} alt="" style={{ width: 36, height: 36, borderRadius: 4, objectFit: "cover" }} />}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{qs.selectedCandidate.title}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{qs.selectedCandidate.artist}</div>
                    </div>
                  </div>
                )}
                {qs.error && <p style={{ color: "#ef4444", fontSize: 12, marginBottom: 8 }}>{qs.error}</p>}
                <WaveformEditor
                  audioBuffer={qs.audioBuffer}
                  peaks={qs.peaks}
                  clipStart={qs.clipStart}
                  clipEnd={qs.clipEnd}
                  onStartChange={v => setState(i, { clipStart: v })}
                  onEndChange={v => setState(i, { clipEnd: v })}
                  onSave={() => saveClip(openRound, i)}
                  onDiscard={() => setState(i, { phase: "candidates", audioBuffer: null, peaks: [] })}
                  saving={false}
                />
              </div>
            )}

            {/* Phase: saving */}
            {qs.phase === "saving" && (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Uploading clip...</div>
            )}

            {/* Phase: done */}
            {qs.phase === "done" && qs.savedUrl && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <audio controls src={qs.savedUrl} style={{ width: "100%", height: 32 }} />
                <button type="button" onClick={() => setState(i, { phase: "candidates", candidates: [], audioBuffer: null, peaks: [] })}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 11, textDecoration: "underline", cursor: "pointer", alignSelf: "flex-start", padding: 0 }}>
                  Replace clip
                </button>
              </div>
            )}
          </div>
        );
      })}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
