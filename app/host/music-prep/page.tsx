"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { encodeWavFromBuffer, sliceAudioBuffer } from "@/lib/audio/wavEncoder";
import { getMediaUrl } from "@/lib/getMediaUrl";
import { HostShell, HostButton, HostLoading, HostEmpty, TopSpacer } from "@/components/fable/HostConsole";

const purple = "#BE26C1";
const STAGE_BG = "radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118";
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

  async function playPreview() {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AC();
    }
    // Resume context if suspended by browser autoplay policy
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    stopPreview();
    const start = Math.max(0, Math.min(clipStart, audioBuffer.duration - 0.1));
    const duration = Math.max(0.1, Math.min(clipEnd - clipStart, audioBuffer.duration - start));
    const src = audioCtxRef.current.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(audioCtxRef.current.destination);
    src.start(0, start, duration);
    src.onended = () => setPreviewing(false);
    sourceRef.current = src;
    setPreviewing(true);
  }

  const startPct = (clipStart / audioBuffer.duration) * 100;
  const endPct = (clipEnd / audioBuffer.duration) * 100;
  const clipDuration = clipEnd - clipStart;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ font: "400 12px 'Inter'", color: "#B9A8D9" }}>
        Drag handles to select your clip — <strong style={{ color: "#fff" }}>{fmtTime(clipDuration)}</strong> selected
      </div>

      <div ref={waveformRef} style={{ position: "relative", height: 80, borderRadius: 12, background: "#0A0118", border: "1px solid #2E1A52", overflow: "hidden", userSelect: "none", cursor: "crosshair" }}>
        <svg width="100%" height="80" viewBox={`0 0 ${WAVEFORM_BUCKETS} 80`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
          {peaks.map((p, i) => (
            <rect key={i} x={i} y={40 - p * 38} width={0.8} height={Math.max(1, p * 76)}
              fill={i / WAVEFORM_BUCKETS >= startPct / 100 && i / WAVEFORM_BUCKETS <= endPct / 100
                ? "rgba(190,38,193,0.9)" : "rgba(185,168,217,0.22)"} />
          ))}
        </svg>
        {/* Dim regions outside selection */}
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: startPct + "%", background: "rgba(10,1,24,0.6)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 0, right: 0, height: "100%", width: (100 - endPct) + "%", background: "rgba(10,1,24,0.6)", pointerEvents: "none" }} />
        {/* Start handle */}
        <div onPointerDown={() => setDragging("start")} style={{ position: "absolute", top: 0, left: startPct + "%", transform: "translateX(-50%)", height: "100%", width: 16, cursor: "ew-resize", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 4, height: "100%", background: "#D94FDC", borderRadius: 2, boxShadow: "0 0 8px rgba(217,79,220,0.8)" }} />
        </div>
        {/* End handle */}
        <div onPointerDown={() => setDragging("end")} style={{ position: "absolute", top: 0, left: endPct + "%", transform: "translateX(-50%)", height: "100%", width: 16, cursor: "ew-resize", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 4, height: "100%", background: "#D94FDC", borderRadius: 2, boxShadow: "0 0 8px rgba(217,79,220,0.8)" }} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", font: "400 11px 'Inter'", color: "#6B5A8E" }}>
        <span>{fmtTime(clipStart)}</span>
        <span>{fmtTime(audioBuffer.duration)}</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <HostButton type="button" onClick={previewing ? stopPreview : playPreview}>
          {previewing ? "◼ Stop" : "▶ Preview"}
        </HostButton>
        <HostButton type="button" variant="pri" onClick={onSave} disabled={saving}>
          {saving ? "SAVING…" : "SAVE CLIP →"}
        </HostButton>
        <HostButton type="button" onClick={onDiscard}>
          Try different version
        </HostButton>
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

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.from("rounds").select("*").order("created_at", { ascending: false });
      if (!error && data) {
        setRounds(data.filter((r: Round) => r.questions?.some((q: Question) => q.question_type === "audio")));
      }
      setLoading(false);
    })();
  }, []);

  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AC();
    }
    return audioCtxRef.current;
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

  async function searchForQuestion(round: Round, qIdx: number, rawQuery: string) {
    // Strip YouTube-style suffixes before sending to Deezer - option_a often
    // contains strings like "Common People Pulp official audio" which Deezer
    // doesn't find; we need just "Common People Pulp"
    const query = rawQuery
      .replace(/\s*(official\s*(audio|video|music\s*video|lyric\s*video)?|lyrics?|hd|hq|\d{4})\s*/gi, " ")
      .trim();
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
    <HostShell>
      <div style={{ minHeight: "100vh", background: STAGE_BG, color: "#fff", padding: "24px", maxWidth: 980, margin: "0 auto" }}>
        {/* TOP BAR */}
        <div className="fbh-top" style={{ border: "1px solid #2E1A52", borderRadius: 16, marginBottom: 20 }}>
          <span className="fbh-wm" style={{ fontSize: 16 }}><span className="q">QUIZ-</span>IT</span>
          <span className="fbh-bc">Music Prep</span>
          <span style={{ font: "400 11px 'Inter'", color: "#6B5A8E" }}>Deezer · Auto-search · Waveform trim</span>
          <TopSpacer />
          <a className="fbh-btn" href="/host/events">Events</a>
          {openRound
            ? <HostButton onClick={() => setOpenRound(null)}>← All Rounds</HostButton>
            : <a className="fbh-btn" href="/host/rounds">Round Library</a>}
        </div>

        {status && <div style={{ textAlign: "center", color: "#D94FDC", font: "600 13px 'Inter'", marginBottom: 16 }}>{status}</div>}

        {/* ROUND LIST */}
        {!openRound && (
          <>
            {loading && <HostLoading title="Music Prep" note="Loading music rounds…" />}
            {!loading && rounds.length === 0 && (
              <HostEmpty title="No Music Rounds" note="Generate a music round, then prep its clips here." actionLabel="GENERATE MUSIC ROUND" onAction={() => { window.location.href = "/host/questions"; }} />
            )}
            {rounds.map(r => {
              const total = r.questions.filter(q => q.question_type === "audio").length;
              const prepped = r.questions.filter(q => q.question_type === "audio" && q.option_b && q.option_b.includes("blob.vercel-storage.com")).length;
              const ready = prepped === total;
              return (
                <div key={r.id} onClick={() => openForPrep(r)} className="fbh-panel" style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: "700 15px 'Inter'", marginBottom: 4 }}>{r.name}</div>
                    <div style={{ font: "400 12px 'Inter'", color: "#6B5A8E" }}>{total} music questions · {prepped}/{total} prepped · {new Date(r.created_at).toLocaleDateString()}</div>
                  </div>
                  <span className={ready ? "fbh-pill live" : "fbh-pill"}>{ready ? "✓ Ready" : "Prep →"}</span>
                </div>
              );
            })}
          </>
        )}

        {/* QUESTION PREP */}
        {openRound && audioQuestions.map(({ q, i }, n) => {
          const qs = questionStates[i] || { phase: "idle", candidates: [], error: "" };
          return (
            <div key={i} className="fbh-panel" style={{ border: `1px solid ${qs.phase === "done" ? "rgba(46,224,110,0.4)" : "#2E1A52"}` }}>
              {/* Question header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span className="fbh-chip on">Name That Tune {n + 1}</span>
                    {qs.phase === "done" && <span style={{ color: "#2EE06E", font: "700 12px 'Inter'" }}>✓ Ready</span>}
                  </div>
                  <p style={{ font: "600 15px 'Inter'", margin: "0 0 4px", lineHeight: 1.5 }}>{q.question_text}</p>
                  <p style={{ font: "600 13px 'Inter'", color: "#2EE06E", margin: 0 }}>Answer: {q.correct_answer}</p>
                </div>
              </div>

              {/* Phase: searching */}
              {(qs.phase === "idle" || qs.phase === "searching") && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#B9A8D9", font: "400 13px 'Inter'" }}>
                  <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(190,38,193,0.4)", borderTopColor: purple, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  Searching Deezer for &ldquo;{q.option_a || q.correct_answer}&rdquo;…
                </div>
              )}

              {/* Phase: loading audio */}
              {qs.phase === "loading_audio" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#B9A8D9", font: "400 13px 'Inter'" }}>
                  <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(190,38,193,0.4)", borderTopColor: purple, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  Loading audio…
                </div>
              )}

              {/* Phase: candidates */}
              {qs.phase === "candidates" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {qs.error && <p style={{ color: "#FF3B4E", font: "400 12px 'Inter'", margin: 0 }}>{qs.error}</p>}
                  {qs.candidates.length === 0 && !qs.error && (
                    <p style={{ font: "400 12px 'Inter'", color: "#6B5A8E" }}>No Deezer results found.</p>
                  )}
                  {qs.candidates.map((c) => (
                    <button key={c.id} type="button" onClick={() => selectCandidate(openRound, i, c)}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 14, background: "#150A2E", border: "1px solid #2E1A52", cursor: "pointer", textAlign: "left", width: "100%" }}>
                      {c.cover && <img src={c.cover} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: "600 13px 'Inter'", color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                        <div style={{ font: "400 11px 'Inter'", color: "#6B5A8E" }}>{c.artist} · {c.album} · {c.duration_formatted}</div>
                      </div>
                      <div style={{ flexShrink: 0, font: "700 12px 'Inter'", color: purple }}>Select →</div>
                    </button>
                  ))}
                  <button type="button" onClick={() => searchForQuestion(openRound, i, q.option_a || q.correct_answer)}
                    style={{ background: "none", border: "none", color: "#6B5A8E", font: "400 11px 'Inter'", textDecoration: "underline", cursor: "pointer", alignSelf: "flex-start", padding: 0 }}>
                    Search again
                  </button>
                </div>
              )}

              {/* Phase: trim */}
              {qs.phase === "trim" && qs.audioBuffer && (
                <div>
                  {qs.selectedCandidate && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: "8px 12px", borderRadius: 12, background: "#150A2E", border: "1px solid #2E1A52" }}>
                      {qs.selectedCandidate.cover && <img src={qs.selectedCandidate.cover} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} />}
                      <div>
                        <div style={{ font: "600 13px 'Inter'", color: "#fff" }}>{qs.selectedCandidate.title}</div>
                        <div style={{ font: "400 11px 'Inter'", color: "#6B5A8E" }}>{qs.selectedCandidate.artist}</div>
                      </div>
                    </div>
                  )}
                  {qs.error && <p style={{ color: "#FF3B4E", font: "400 12px 'Inter'", marginBottom: 8 }}>{qs.error}</p>}
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
                <div style={{ font: "400 13px 'Inter'", color: "#B9A8D9" }}>Uploading clip…</div>
              )}

              {/* Phase: done */}
              {qs.phase === "done" && qs.savedUrl && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <audio controls src={getMediaUrl(qs.savedUrl) || undefined} style={{ width: "100%", height: 32 }} />
                  <button type="button" onClick={() => setState(i, { phase: "candidates", candidates: [], audioBuffer: null, peaks: [] })}
                    style={{ background: "none", border: "none", color: "#6B5A8E", font: "400 11px 'Inter'", textDecoration: "underline", cursor: "pointer", alignSelf: "flex-start", padding: 0 }}>
                    Replace clip
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </HostShell>
  );
}
