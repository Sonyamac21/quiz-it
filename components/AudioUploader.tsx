"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { encodeWavFromBuffer, sliceAudioBuffer } from "@/lib/audio/wavEncoder";

type Props = {
  currentUrl: string | null;
  onUploaded: (url: string, meta: { duration: number; clipStart: number; clipEnd: number; originalFilename: string; fileSize: number }) => void;
};

const ACCEPTED_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/aac", "audio/mp4", "audio/x-m4a", "audio/m4a"];
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB - generous for a full song, the saved clip itself will be tiny
const MAX_CLIP_SECONDS = 30;
const WAVEFORM_BUCKETS = 240;

type LibraryClip = { id: string; file_url: string; title: string | null; artist: string | null; category: string | null; duration_seconds: number | null; upload_date: string };

export function AudioUploader({ currentUrl, onUploaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(0);
  const [dragHandle, setDragHandle] = useState<"start" | "end" | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryResults, setLibraryResults] = useState<LibraryClip[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  const waveformRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);

  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AC();
    }
    return audioCtxRef.current;
  }

  function validate(file: File): string | null {
    const okType = ACCEPTED_TYPES.includes(file.type) || /\.(mp3|wav|aac|m4a)$/i.test(file.name);
    if (!okType) return "Only MP3, WAV, AAC, or M4A audio files are supported.";
    if (file.size > MAX_FILE_BYTES) return "Audio file is too large - max 25MB.";
    return null;
  }

  async function handleFile(file: File) {
    const err = validate(file);
    if (err) { setError(err); return; }
    setError("");
    setDecoding(true);
    setFileName(file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = getAudioCtx();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      setAudioBuffer(decoded);
      setPeaks(computePeaks(decoded, WAVEFORM_BUCKETS));
      setClipStart(0);
      setClipEnd(Math.min(decoded.duration, MAX_CLIP_SECONDS));
    } catch {
      setError("Couldn't read that audio file - it may be corrupted or an unsupported encoding.");
    } finally {
      setDecoding(false);
    }
  }

  function computePeaks(buffer: AudioBuffer, buckets: number): number[] {
    const data = buffer.getChannelData(0);
    const bucketSize = Math.floor(data.length / buckets);
    const result: number[] = [];
    for (let i = 0; i < buckets; i++) {
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

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!dragHandle || !waveformRef.current || !audioBuffer) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = ratio * audioBuffer.duration;
    if (dragHandle === "start") {
      setClipStart(prev => Math.min(time, clipEnd - 0.2));
    } else {
      setClipEnd(prev => Math.max(time, clipStart + 0.2));
    }
  }, [dragHandle, audioBuffer, clipStart, clipEnd]);

  useEffect(() => {
    if (!dragHandle) return;
    function up() { setDragHandle(null); }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", up);
    };
  }, [dragHandle, handlePointerMove]);

  function stopPreview() {
    if (previewSourceRef.current) {
      try { previewSourceRef.current.stop(); } catch { /* already stopped */ }
      previewSourceRef.current = null;
    }
    setPreviewing(false);
  }

  function playPreview() {
    if (!audioBuffer) return;
    stopPreview();
    const ctx = getAudioCtx();
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    const duration = clipEnd - clipStart;
    source.start(0, clipStart, duration);
    source.onended = () => setPreviewing(false);
    previewSourceRef.current = source;
    setPreviewing(true);
  }

  async function handleSaveClip() {
    if (!audioBuffer) return;
    setUploading(true);
    setError("");
    try {
      const sliced = sliceAudioBuffer(audioBuffer, clipStart, clipEnd);
      const wavBlob = encodeWavFromBuffer(sliced);
      const formData = new FormData();
      formData.append("file", wavBlob, "clip.wav");
      const res = await fetch("/api/upload-audio", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data?.error?.message || "Upload failed");
      onUploaded(data.url, {
        duration: clipEnd - clipStart,
        clipStart,
        clipEnd,
        originalFilename: fileName,
        fileSize: data.fileSize,
      });
      setAudioBuffer(null);
      setPeaks([]);
      setFileName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed - please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function searchLibrary(q: string) {
    setLibrarySearch(q);
    setLibraryLoading(true);
    const supabase = createSupabaseBrowserClient();
    let query = supabase.from("media_assets").select("id, file_url, title, artist, category, duration_seconds, upload_date").eq("media_type", "audio").order("upload_date", { ascending: false }).limit(20);
    if (q.trim().length >= 2) {
      query = query.or(`title.ilike.%${q}%,artist.ilike.%${q}%,category.ilike.%${q}%`);
    }
    const { data } = await query;
    setLibraryResults(data || []);
    setLibraryLoading(false);
  }

  function fmtTime(t: number): string {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  const startPct = audioBuffer ? (clipStart / audioBuffer.duration) * 100 : 0;
  const endPct = audioBuffer ? (clipEnd / audioBuffer.duration) * 100 : 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {currentUrl && !audioBuffer && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(190,38,193,0.3)" }}>
          <audio controls src={currentUrl} style={{ height: 32, flex: 1 }} />
        </div>
      )}

      {!audioBuffer && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          onClick={() => inputRef.current?.click()}
          style={{
            padding: "18px 16px", borderRadius: 10, textAlign: "center", cursor: "pointer",
            border: "2px dashed " + (dragging ? "#BE26C1" : "rgba(190,38,193,0.4)"),
            background: dragging ? "rgba(190,38,193,0.1)" : "rgba(255,255,255,0.03)",
            fontSize: 13, color: "rgba(255,255,255,0.6)",
          }}
        >
          {decoding ? "Reading audio..." : (currentUrl ? "Drop a new audio file here or click to replace" : "Drop an audio file here or click to upload (MP3, WAV, AAC, M4A, max 25MB)")}
          <input ref={inputRef} type="file" accept="audio/*,.mp3,.wav,.aac,.m4a" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      )}

      {!audioBuffer && (
        <div>
          <button type="button" onClick={() => { setShowLibrary(s => !s); if (!showLibrary) searchLibrary(""); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}>
            {showLibrary ? "Hide clip library" : "Or reuse a clip from your library"}
          </button>
          {showLibrary && (
            <div style={{ marginTop: 8, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <input
                value={librarySearch}
                onChange={(e) => searchLibrary(e.target.value)}
                placeholder="Search by artist, title, or category..."
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 13, marginBottom: 8, boxSizing: "border-box" as const }}
              />
              {libraryLoading && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Searching...</p>}
              {!libraryLoading && libraryResults.length === 0 && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>No clips found.</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" as const }}>
                {libraryResults.map(clip => (
                  <div key={clip.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.05)" }}>
                    <div style={{ fontSize: 12, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {clip.title || "Untitled clip"}{clip.artist ? " - " + clip.artist : ""}
                      {clip.duration_seconds ? <span style={{ color: "rgba(255,255,255,0.4)" }}> ({fmtTime(clip.duration_seconds)})</span> : null}
                    </div>
                    <button type="button" onClick={() => onUploaded(clip.file_url, { duration: clip.duration_seconds || 0, clipStart: 0, clipEnd: clip.duration_seconds || 0, originalFilename: clip.title || "library-clip", fileSize: 0 })}
                      style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 6, background: "rgba(190,38,193,0.25)", border: "1px solid #BE26C1", color: "#fff", fontSize: 11, cursor: "pointer" }}>
                      Use
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {audioBuffer && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{fileName} - drag the handles to select your clip ({fmtTime(clipEnd - clipStart)} selected, max {MAX_CLIP_SECONDS}s)</div>

          <div ref={waveformRef} style={{ position: "relative", height: 70, borderRadius: 8, background: "rgba(0,0,0,0.3)", overflow: "hidden", userSelect: "none" as const }}>
            <svg width="100%" height="70" viewBox={`0 0 ${WAVEFORM_BUCKETS} 70`} preserveAspectRatio="none" style={{ position: "absolute", top: 0, left: 0 }}>
              {peaks.map((p, i) => (
                <rect key={i} x={i} y={35 - p * 33} width={0.8} height={Math.max(1, p * 66)} fill="rgba(190,38,193,0.7)" />
              ))}
            </svg>
            <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: startPct + "%", background: "rgba(0,0,0,0.55)" }} />
            <div style={{ position: "absolute", top: 0, right: 0, height: "100%", width: (100 - endPct) + "%", background: "rgba(0,0,0,0.55)" }} />
            <div
              onPointerDown={() => setDragHandle("start")}
              style={{ position: "absolute", top: 0, left: startPct + "%", height: "100%", width: 10, marginLeft: -5, cursor: "ew-resize", background: "#fff", borderRadius: 4, boxShadow: "0 0 8px rgba(255,255,255,0.6)" }}
            />
            <div
              onPointerDown={() => setDragHandle("end")}
              style={{ position: "absolute", top: 0, left: endPct + "%", height: "100%", width: 10, marginLeft: -5, cursor: "ew-resize", background: "#fff", borderRadius: 4, boxShadow: "0 0 8px rgba(255,255,255,0.6)" }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            <span>{fmtTime(clipStart)}</span>
            <span>{fmtTime(audioBuffer.duration)}</span>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            <button type="button" onClick={previewing ? stopPreview : playPreview} style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(56,189,248,0.2)", border: "1px solid #38bdf8", color: "#38bdf8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {previewing ? "\u23f9 Stop" : "\u25b6 Preview Clip"}
            </button>
            <button type="button" onClick={handleSaveClip} disabled={uploading} style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(34,197,94,0.25)", border: "1px solid #22c55e", color: "#fff", fontSize: 12, fontWeight: 700, cursor: uploading ? "default" : "pointer" }}>
              {uploading ? "Saving..." : "Save Clip"}
            </button>
            <button type="button" onClick={() => { stopPreview(); setAudioBuffer(null); setPeaks([]); }} style={{ padding: "6px 14px", borderRadius: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)", fontSize: 12, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  );
}
