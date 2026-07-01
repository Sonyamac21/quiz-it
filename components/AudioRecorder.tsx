"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { encodeWavFromBuffer, sliceAudioBuffer } from "@/lib/audio/wavEncoder";
import { getMediaUrl } from "@/lib/getMediaUrl";

const purple = "#BE26C1";
const WAVEFORM_BUCKETS = 240;
const MAX_CLIP_SECONDS = 30;

type ClipMeta = {
  title: string;
  artist: string;
  genre: string;
  year: string;
  category: string;
};

type LibraryClip = {
  id: string;
  file_url: string;
  title: string | null;
  artist: string | null;
  genre: string | null;
  year: number | null;
  category: string | null;
  duration_seconds: number | null;
};

type Props = {
  // The YouTube search query the AI generated (option_a) - used for library lookup
  songReference: string | null;
  // Currently attached clip URL (option_b) - null if no clip yet
  currentUrl: string | null;
  onUploaded: (
    url: string,
    meta: { duration: number; clipStart: number; clipEnd: number; originalFilename: string; fileSize: number },
    clipMeta: ClipMeta
  ) => void;
};

export function AudioRecorder({ songReference, currentUrl, onUploaded }: Props) {
  const [tab, setTab] = useState<"record" | "upload" | "library">("record");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(0);
  const [dragHandle, setDragHandle] = useState<"start" | "end" | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [showMeta, setShowMeta] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [pendingFileMeta, setPendingFileMeta] = useState<{ duration: number; clipStart: number; clipEnd: number; fileSize: number } | null>(null);
  const [clipMeta, setClipMeta] = useState<ClipMeta>({ title: "", artist: "", genre: "", year: "", category: "Music Round" });
  const [libraryResults, setLibraryResults] = useState<LibraryClip[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [decoding, setDecoding] = useState(false);

  const waveformRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-search the library when the song reference is available
  useEffect(() => {
    if (songReference && songReference.length > 2) {
      searchLibrary(songReference);
    }
  }, [songReference]);

  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AC();
    }
    return audioCtxRef.current;
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

  function openTrimEditor(buffer: AudioBuffer) {
    setAudioBuffer(buffer);
    setPeaks(computePeaks(buffer));
    setClipStart(0);
    setClipEnd(Math.min(buffer.duration, MAX_CLIP_SECONDS));
  }

  async function startRecording() {
    setError("");
    try {
      // Audio-only tab capture - browser shows its native "Share a tab" picker
      const stream = await (navigator.mediaDevices as unknown as {
        getDisplayMedia: (opts: unknown) => Promise<MediaStream>;
      }).getDisplayMedia({ audio: true, video: false });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        streamRef.current?.getTracks().forEach(t => t.stop());
        setRecording(false);
        setRecordingSeconds(0);

        if (chunksRef.current.length === 0) return;
        setDecoding(true);
        try {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const arrayBuffer = await blob.arrayBuffer();
          const ctx = getAudioCtx();
          const decoded = await ctx.decodeAudioData(arrayBuffer);
          openTrimEditor(decoded);
        } catch {
          setError("Failed to process recording. Try again.");
        } finally {
          setDecoding(false);
        }
      };

      // If user closes the browser share dialog, treat it as a stop
      stream.getAudioTracks()[0]?.addEventListener("ended", () => {
        if (recorder.state !== "inactive") recorder.stop();
      });

      recorder.start(100); // collect chunks every 100ms
      setRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch (e) {
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Permission denied. Allow tab sharing when prompted."
          : "Could not start recording. Make sure you are using Chrome or Edge."
      );
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
  }

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!dragHandle || !waveformRef.current || !audioBuffer) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = ratio * audioBuffer.duration;
    if (dragHandle === "start") setClipStart(Math.min(time, clipEnd - 0.2));
    else setClipEnd(Math.max(time, clipStart + 0.2));
  }, [dragHandle, audioBuffer, clipStart, clipEnd]);

  useEffect(() => {
    if (!dragHandle) return;
    const up = () => setDragHandle(null);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", up);
    };
  }, [dragHandle, handlePointerMove]);

  function stopPreview() {
    try { previewSourceRef.current?.stop(); } catch { /* already stopped */ }
    previewSourceRef.current = null;
    setPreviewing(false);
  }

  function playPreview() {
    if (!audioBuffer) return;
    stopPreview();
    const ctx = getAudioCtx();
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start(0, clipStart, clipEnd - clipStart);
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
      setPendingUrl(data.url);
      setPendingFileMeta({ duration: clipEnd - clipStart, clipStart, clipEnd, fileSize: data.fileSize });
      // Pre-fill metadata from song reference if available
      if (songReference) {
        const parts = songReference.replace(/\s+official.*$/i, "").replace(/\s+video.*$/i, "").split(/\s+by\s+|\s+-\s+/i);
        if (parts.length >= 2) {
          setClipMeta(m => ({ ...m, title: parts[0].trim(), artist: parts[1].trim() }));
        }
      }
      setShowMeta(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirmMeta() {
    if (!pendingUrl || !pendingFileMeta) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("media_assets").insert({
      file_name: (clipMeta.title || "clip") + ".wav",
      media_type: "audio",
      file_url: pendingUrl,
      file_size: pendingFileMeta.fileSize,
      duration_seconds: pendingFileMeta.duration,
      clip_start: pendingFileMeta.clipStart,
      clip_end: pendingFileMeta.clipEnd,
      original_filename: songReference || "recording",
      title: clipMeta.title || null,
      artist: clipMeta.artist || null,
      genre: clipMeta.genre || null,
      year: clipMeta.year ? parseInt(clipMeta.year) : null,
      category: clipMeta.category || null,
      source_type: "recording",
    }).then(({ error: e }) => { if (e) console.error("media_assets insert:", e); });

    onUploaded(pendingUrl, { ...pendingFileMeta, originalFilename: clipMeta.title || "clip" }, clipMeta);
    setAudioBuffer(null);
    setPeaks([]);
    setShowMeta(false);
    setPendingUrl(null);
    setPendingFileMeta(null);
  }

  async function searchLibrary(q: string) {
    setLibrarySearch(q);
    setLibraryLoading(true);
    const supabase = createSupabaseBrowserClient();
    const terms = q.trim().split(/\s+/).filter(t => t.length > 2).slice(0, 4);
    const orClause = terms.map(t => `title.ilike.%${t}%,artist.ilike.%${t}%`).join(",");
    const { data } = await supabase
      .from("media_assets")
      .select("id, file_url, title, artist, genre, year, category, duration_seconds")
      .eq("media_type", "audio")
      .or(orClause || "title.is.null")
      .limit(20);
    setLibraryResults(data || []);
    setLibraryLoading(false);
  }

  async function handleFileUpload(file: File) {
    setError("");
    setDecoding(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = getAudioCtx();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      openTrimEditor(decoded);
    } catch {
      setError("Could not read audio file. Try MP3, WAV, AAC, or M4A.");
    } finally {
      setDecoding(false);
    }
  }

  function fmtTime(t: number): string {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  const startPct = audioBuffer ? (clipStart / audioBuffer.duration) * 100 : 0;
  const endPct = audioBuffer ? (clipEnd / audioBuffer.duration) * 100 : 100;
  const clipDuration = clipEnd - clipStart;

  // If a real clip is already attached, just show the player
  if (currentUrl && currentUrl.includes("blob.vercel-storage.com") && !audioBuffer) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}>
          <div style={{ fontSize: 12, color: "#4ade80", marginRight: 4 }}>✓ Clip attached</div>
          <audio controls src={getMediaUrl(currentUrl) || undefined} style={{ height: 32, flex: 1 }} />
        </div>
        <button type="button" onClick={() => { /* clear currentUrl via parent */ onUploaded("", { duration: 0, clipStart: 0, clipEnd: 0, originalFilename: "", fileSize: 0 }, clipMeta); }}
          style={{ alignSelf: "flex-start", background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}>
          Replace clip
        </button>
      </div>
    );
  }

  // Metadata confirmation form
  if (showMeta) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(190,38,193,0.3)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: purple }}>Save clip to Music Library</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { label: "Song Title", key: "title" },
            { label: "Artist", key: "artist" },
            { label: "Genre", key: "genre" },
            { label: "Year", key: "year" },
          ].map(({ label, key }) => (
            <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>{label.toUpperCase()}</label>
              <input
                value={clipMeta[key as keyof ClipMeta]}
                onChange={e => setClipMeta(m => ({ ...m, [key]: e.target.value }))}
                placeholder={label}
                style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 13 }}
              />
            </div>
          ))}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>CATEGORY</label>
            <select value={clipMeta.category} onChange={e => setClipMeta(m => ({ ...m, category: e.target.value }))}
              style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 13 }}>
              <option>Music Round</option>
              <option>Name That Tune</option>
              <option>90s Music</option>
              <option>00s Music</option>
              <option>Pop</option>
              <option>Rock</option>
              <option>Hip Hop</option>
              <option>RnB</option>
              <option>Dance</option>
              <option>Classics</option>
              <option>Movie Soundtrack</option>
              <option>TV Theme</option>
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={handleConfirmMeta}
            style={{ padding: "10px 20px", borderRadius: 10, background: purple, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Save to Library &amp; Attach to Question
          </button>
          <button type="button" onClick={() => setShowMeta(false)}
            style={{ padding: "10px 16px", borderRadius: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>
            Back
          </button>
        </div>
      </div>
    );
  }

  // Trim editor (shared between Record and Upload paths)
  if (audioBuffer) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          Drag the handles to select your clip — {fmtTime(clipDuration)} selected (max {MAX_CLIP_SECONDS}s)
        </div>
        <div ref={waveformRef} style={{ position: "relative", height: 70, borderRadius: 8, background: "rgba(0,0,0,0.35)", overflow: "hidden", userSelect: "none" }}>
          <svg width="100%" height="70" viewBox={`0 0 ${WAVEFORM_BUCKETS} 70`} preserveAspectRatio="none" style={{ position: "absolute" }}>
            {peaks.map((p, i) => <rect key={i} x={i} y={35 - p * 33} width={0.8} height={Math.max(1, p * 66)} fill="rgba(190,38,193,0.75)" />)}
          </svg>
          <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: startPct + "%", background: "rgba(0,0,0,0.6)" }} />
          <div style={{ position: "absolute", top: 0, right: 0, height: "100%", width: (100 - endPct) + "%", background: "rgba(0,0,0,0.6)" }} />
          <div onPointerDown={() => setDragHandle("start")}
            style={{ position: "absolute", top: 0, left: startPct + "%", height: "100%", width: 10, marginLeft: -5, cursor: "ew-resize", background: "#fff", borderRadius: 3, boxShadow: "0 0 8px rgba(255,255,255,0.7)" }} />
          <div onPointerDown={() => setDragHandle("end")}
            style={{ position: "absolute", top: 0, left: endPct + "%", height: "100%", width: 10, marginLeft: -5, cursor: "ew-resize", background: "#fff", borderRadius: 3, boxShadow: "0 0 8px rgba(255,255,255,0.7)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
          <span>{fmtTime(clipStart)}</span><span>{fmtTime(audioBuffer.duration)}</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={previewing ? stopPreview : playPreview}
            style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(56,189,248,0.2)", border: "1px solid #38bdf8", color: "#38bdf8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {previewing ? "⏹ Stop" : "▶ Preview"}
          </button>
          <button type="button" onClick={handleSaveClip} disabled={uploading}
            style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(34,197,94,0.25)", border: "1px solid #22c55e", color: "#fff", fontSize: 12, fontWeight: 700, cursor: uploading ? "default" : "pointer" }}>
            {uploading ? "Saving..." : "Save Clip →"}
          </button>
          <button type="button" onClick={() => { stopPreview(); setAudioBuffer(null); setPeaks([]); }}
            style={{ padding: "8px 14px", borderRadius: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer" }}>
            Discard
          </button>
        </div>
        {error && <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
        {[
          { key: "library", label: "🎵 Music Library" },
          { key: "record", label: "⏺ Record" },
          { key: "upload", label: "📁 Upload MP3" },
        ].map(({ key, label }) => (
          <button key={key} type="button" onClick={() => setTab(key as typeof tab)}
            style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
              background: tab === key ? purple : "rgba(255,255,255,0.05)", color: tab === key ? "#fff" : "rgba(255,255,255,0.5)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Library tab */}
      {tab === "library" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input value={librarySearch} onChange={e => searchLibrary(e.target.value)}
            placeholder="Search your music library by title or artist..."
            style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 13 }} />
          {libraryLoading && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Searching...</div>}
          {!libraryLoading && libraryResults.length === 0 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>No clips in library yet. Record or upload your first clip.</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
            {libraryResults.map(clip => (
              <div key={clip.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {clip.title || "Untitled"}{clip.artist ? ` — ${clip.artist}` : ""}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                    {[clip.genre, clip.year, clip.category, clip.duration_seconds ? fmtTime(clip.duration_seconds) : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <button type="button"
                  onClick={() => onUploaded(clip.file_url, { duration: clip.duration_seconds || 0, clipStart: 0, clipEnd: clip.duration_seconds || 0, originalFilename: clip.title || "clip", fileSize: 0 }, { title: clip.title || "", artist: clip.artist || "", genre: clip.genre || "", year: clip.year?.toString() || "", category: clip.category || "" })}
                  style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 8, background: "rgba(190,38,193,0.25)", border: "1px solid " + purple, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Use
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Record tab */}
      {tab === "record" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
            <strong style={{ color: "rgba(255,255,255,0.85)" }}>How to record:</strong><br />
            1. Open the YouTube video in another tab and find the section you want<br />
            2. Click <strong style={{ color: "#ef4444" }}>Start Recording</strong> below — Chrome will ask you to choose a tab to share<br />
            3. Select the YouTube tab, then play the video from your chosen start point<br />
            4. Click <strong style={{ color: "#ef4444" }}>Stop Recording</strong> when done — the waveform editor opens automatically
          </div>
          {songReference && (
            <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(songReference)}`} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.4)", color: "#fb923c", textDecoration: "none", fontSize: 12, fontWeight: 600, alignSelf: "flex-start" }}>
              🔍 Find "{songReference}" on YouTube
            </a>
          )}
          {!recording && !decoding && (
            <button type="button" onClick={startRecording}
              style={{ padding: "14px 24px", borderRadius: 12, background: "rgba(239,68,68,0.25)", border: "2px solid #ef4444", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, alignSelf: "flex-start" }}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
              Start Recording
            </button>
          )}
          {recording && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)" }}>
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#ef4444", animation: "pulse 1s infinite" }} />
                <span style={{ fontSize: 13, color: "#ef4444", fontWeight: 700 }}>Recording — {fmtTime(recordingSeconds)}</span>
              </div>
              <button type="button" onClick={stopRecording}
                style={{ padding: "10px 20px", borderRadius: 10, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                ⏹ Stop Recording
              </button>
            </div>
          )}
          {decoding && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Processing recording...</div>}
          {error && <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>{error}</p>}
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
        </div>
      )}

      {/* Upload tab */}
      {tab === "upload" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            onDragOver={e => { e.preventDefault(); }}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFileUpload(f); }}
            onClick={() => inputRef.current?.click()}
            style={{ padding: "20px 16px", borderRadius: 10, textAlign: "center", cursor: "pointer", border: "2px dashed rgba(190,38,193,0.4)", background: "rgba(255,255,255,0.03)", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
            {decoding ? "Reading audio..." : "Drop an MP3, WAV, AAC or M4A file here, or click to browse (max 25MB)"}
            <input ref={inputRef} type="file" accept="audio/*,.mp3,.wav,.aac,.m4a" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
          </div>
          {error && <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
