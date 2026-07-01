"use client";
import { useRef, useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const COMPANION = "http://localhost:7823";
const purple = "#BE26C1";

type CompanionStatus = "checking" | "online" | "offline";

type Candidate = {
  url: string;
  id: string;
  title: string;
  channel: string;
  duration_formatted: string;
  views_formatted: string;
  thumbnail: string;
};

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
  duration_seconds: number | null;
};

type Props = {
  songReference: string | null; // option_a from AI — used for cache check and YouTube search
  currentUrl: string | null;
  onUploaded: (
    url: string,
    meta: { duration: number; clipStart: number; clipEnd: number; originalFilename: string; fileSize: number },
    clipMeta: ClipMeta
  ) => void;
};

type Phase =
  | "init"
  | "cached"       // clip found in Supabase
  | "searching"    // companion searching YouTube
  | "candidates"   // showing 3 results for host to confirm
  | "extracting"   // extracting + uploading
  | "ready"        // clip attached
  | "reextract"    // manual trim override form
  | "upload_fallback"; // companion offline → manual MP3 upload

function fmtTime(t: number): string {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

export function AudioRecorder({ songReference, currentUrl, onUploaded }: Props) {
  const [companion, setCompanion] = useState<CompanionStatus>("checking");
  const [phase, setPhase] = useState<Phase>("init");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [cachedClip, setCachedClip] = useState<LibraryClip | null>(null);
  const [error, setError] = useState("");
  const [clipMeta, setClipMeta] = useState<ClipMeta>({ title: "", artist: "", genre: "", year: "", category: "Music Round" });
  const [reExtractStart, setReExtractStart] = useState("");
  const [extractingMsg, setExtractingMsg] = useState("Extracting clip...");
  const [confirmedCandidate, setConfirmedCandidate] = useState<Candidate | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // On mount: check companion + cache simultaneously
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const [healthOk, cacheHit] = await Promise.all([
        checkCompanion(),
        checkCache(),
      ]);
      if (cancelled) return;
      if (cacheHit) {
        setCachedClip(cacheHit);
        setPhase("cached");
      } else if (healthOk) {
        setCompanion("online");
        if (songReference) startSearch(songReference);
        else setPhase("candidates"); // no query, wait
      } else {
        setCompanion("offline");
        setPhase("upload_fallback");
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  async function checkCompanion(): Promise<boolean> {
    try {
      const r = await fetch(`${COMPANION}/health`, { signal: AbortSignal.timeout(3000) });
      const d = await r.json();
      return d.status === "ok";
    } catch { return false; }
  }

  async function checkCache(): Promise<LibraryClip | null> {
    if (!songReference) return null;
    const supabase = createSupabaseBrowserClient();
    const terms = songReference.toLowerCase().replace(/official|video|lyrics|audio/g, "").trim().split(/\s+/).filter(t => t.length > 2).slice(0, 3);
    if (terms.length === 0) return null;
    const orClause = terms.map(t => `title.ilike.%${t}%,original_filename.ilike.%${t}%`).join(",");
    const { data } = await supabase
      .from("media_assets")
      .select("id, file_url, title, artist, duration_seconds")
      .eq("media_type", "audio")
      .not("file_url", "is", null)
      .or(orClause)
      .limit(1);
    return data?.[0] ?? null;
  }

  async function startSearch(query: string) {
    setPhase("searching");
    setError("");
    try {
      const r = await fetch(`${COMPANION}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(35000),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Search failed");
      setCandidates(d.candidates || []);
      setPhase("candidates");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setPhase("candidates");
    }
  }

  async function handleConfirm(candidate: Candidate) {
    setConfirmedCandidate(candidate);
    // Pre-fill metadata from candidate title
    const parts = candidate.title.replace(/\(.*?\)|\[.*?\]/g, "").split(/\s+-\s+|\s+by\s+/i);
    if (parts.length >= 2) {
      setClipMeta(m => ({ ...m, title: parts[0].trim(), artist: parts[1].trim() }));
    } else {
      setClipMeta(m => ({ ...m, title: candidate.title }));
    }
    await doExtract(candidate.url, null);
  }

  async function doExtract(url: string, trimStart: number | null) {
    setPhase("extracting");
    setError("");
    setExtractingMsg("Extracting clip from YouTube...");
    try {
      const body: Record<string, unknown> = { url, trim_duration: 20 };
      if (trimStart !== null) body.trim_start = trimStart;

      const extractRes = await fetch(`${COMPANION}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(150000),
      });

      if (!extractRes.ok) {
        const d = await extractRes.json().catch(() => ({}));
        throw new Error(d.detail || `Extraction failed (${extractRes.status})`);
      }

      const clipStart = parseFloat(extractRes.headers.get("X-Clip-Start") || "0");
      const clipDuration = parseFloat(extractRes.headers.get("X-Clip-Duration") || "20");
      const totalDuration = parseFloat(extractRes.headers.get("X-Total-Duration") || "0");
      const videoTitle = extractRes.headers.get("X-Video-Title") || "";

      setExtractingMsg("Uploading to cloud storage...");
      const wavBlob = await extractRes.blob();
      const formData = new FormData();
      formData.append("file", wavBlob, "clip.wav");
      const uploadRes = await fetch("/api/upload-audio", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || uploadData.error) throw new Error(uploadData?.error?.message || "Upload failed");

      setExtractingMsg("Saving to music library...");
      const supabase = createSupabaseBrowserClient();
      await supabase.from("media_assets").insert({
        file_name: (clipMeta.title || videoTitle || "clip") + ".wav",
        media_type: "audio",
        file_url: uploadData.url,
        file_size: uploadData.fileSize,
        duration_seconds: clipDuration,
        clip_start: clipStart,
        clip_end: clipStart + clipDuration,
        original_filename: songReference || videoTitle,
        title: clipMeta.title || videoTitle,
        artist: clipMeta.artist || null,
        genre: clipMeta.genre || null,
        year: clipMeta.year ? parseInt(clipMeta.year) : null,
        category: clipMeta.category || "Music Round",
        source_type: "companion_extract",
      });

      onUploaded(
        uploadData.url,
        { duration: clipDuration, clipStart, clipEnd: clipStart + clipDuration, originalFilename: clipMeta.title || videoTitle, fileSize: uploadData.fileSize },
        clipMeta
      );
      setPhase("ready");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Extraction failed";
      setError(msg);
      setPhase("candidates");
    }
  }

  async function handleReExtract() {
    if (!confirmedCandidate) return;
    const start = parseFloat(reExtractStart);
    if (isNaN(start) || start < 0) { setError("Enter a valid start time in seconds"); return; }
    await doExtract(confirmedCandidate.url, start);
  }

  async function handleFileUpload(file: File) {
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload-audio", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data?.error?.message || "Upload failed");
      onUploaded(data.url, { duration: 0, clipStart: 0, clipEnd: 0, originalFilename: file.name, fileSize: data.fileSize }, clipMeta);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const statusDot = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: companion === "online" ? "#4ade80" : companion === "offline" ? "#ef4444" : "rgba(255,255,255,0.35)" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: companion === "online" ? "#4ade80" : companion === "offline" ? "#ef4444" : "rgba(255,255,255,0.3)", display: "inline-block" }} />
      {companion === "online" ? "Companion online" : companion === "offline" ? "Companion offline" : "Checking..."}
    </span>
  );

  // Already has a clip attached
  if (currentUrl && currentUrl.includes("blob.vercel-storage.com") && phase !== "reextract") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}>
          <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 700 }}>✓ Clip attached</span>
          <audio controls src={currentUrl} style={{ height: 32, flex: 1 }} />
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => setPhase("reextract")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}>Adjust trim</button>
          <button type="button" onClick={() => { if (songReference) startSearch(songReference); setPhase("candidates"); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}>Replace clip</button>
          {statusDot}
        </div>
      </div>
    );
  }

  if (phase === "reextract") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(190,38,193,0.3)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: purple }}>Re-extract with custom start time</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Enter the number of seconds from the start of the track where you want the 20-second clip to begin.</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="number" min="0" step="1" value={reExtractStart} onChange={e => setReExtractStart(e.target.value)} placeholder="e.g. 62"
            style={{ width: 100, padding: "8px 10px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 14 }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>seconds in</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={handleReExtract} style={{ padding: "8px 18px", borderRadius: 8, background: purple, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Re-extract</button>
          <button type="button" onClick={() => setPhase("ready")} style={{ padding: "8px 14px", borderRadius: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
        </div>
        {error && <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>{error}</p>}
      </div>
    );
  }

  if (phase === "cached" && cachedClip) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#4ade80" }}>✓ Found in music library</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{cachedClip.title || "Saved clip"}{cachedClip.artist ? ` — ${cachedClip.artist}` : ""}{cachedClip.duration_seconds ? ` (${fmtTime(cachedClip.duration_seconds)})` : ""}</div>
          </div>
          <button type="button" onClick={() => onUploaded(cachedClip.file_url, { duration: cachedClip.duration_seconds || 0, clipStart: 0, clipEnd: cachedClip.duration_seconds || 0, originalFilename: cachedClip.title || "clip", fileSize: 0 }, clipMeta)}
            style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 8, background: purple, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Use This Clip
          </button>
        </div>
        <button type="button" onClick={() => { setCachedClip(null); if (songReference) startSearch(songReference); else setPhase("candidates"); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 11, textDecoration: "underline", cursor: "pointer", alignSelf: "flex-start" }}>Use a different version</button>
      </div>
    );
  }

  if (phase === "init" || phase === "searching") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
          <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(190,38,193,0.5)", borderTopColor: purple, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          {phase === "init" ? "Checking music library..." : "Searching YouTube..."}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (phase === "extracting") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
          <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(190,38,193,0.5)", borderTopColor: purple, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          {extractingMsg}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>This takes 15–30 seconds on first extraction</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12, color: "#4ade80", fontWeight: 700 }}>✓ Clip extracted and saved to library</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button type="button" onClick={() => setPhase("reextract")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}>Adjust trim</button>
          {statusDot}
        </div>
      </div>
    );
  }

  if (phase === "candidates") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
            {candidates.length > 0 ? "Select the correct version:" : "No results found"}
          </div>
          {statusDot}
        </div>
        {error && <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>{error}</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {candidates.map((c, idx) => (
            <button key={c.id} type="button" onClick={() => handleConfirm(c)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", textAlign: "left", width: "100%" }}>
              <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 6, background: "rgba(190,38,193,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: purple }}>{idx + 1}</div>
              {c.thumbnail && <img src={c.thumbnail} alt="" style={{ width: 50, height: 36, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{c.channel} · {c.duration_formatted}{c.views_formatted ? ` · ${c.views_formatted}` : ""}</div>
              </div>
              <div style={{ flexShrink: 0, fontSize: 12, color: purple, fontWeight: 700 }}>Select →</div>
            </button>
          ))}
        </div>
        {candidates.length === 0 && songReference && (
          <button type="button" onClick={() => startSearch(songReference)} style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(190,38,193,0.2)", border: "1px solid rgba(190,38,193,0.4)", color: "#fff", fontSize: 13, cursor: "pointer", alignSelf: "flex-start" }}>Try again</button>
        )}
        <button type="button" onClick={() => setPhase("upload_fallback")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 11, textDecoration: "underline", cursor: "pointer", alignSelf: "flex-start" }}>Upload MP3 instead</button>
      </div>
    );
  }

  // Upload fallback (companion offline or manual preference)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {companion === "offline" && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
          <span style={{ color: "#ef4444", fontWeight: 700 }}>Companion offline</span> — auto-extraction unavailable. Upload an MP3 manually or start the companion app.
        </div>
      )}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFileUpload(f); }}
        onClick={() => inputRef.current?.click()}
        style={{ padding: "18px 16px", borderRadius: 10, textAlign: "center", cursor: "pointer", border: "2px dashed rgba(190,38,193,0.4)", background: "rgba(255,255,255,0.03)", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
        Drop an MP3, WAV, AAC, or M4A file here, or click to upload (max 25MB)
        <input ref={inputRef} type="file" accept="audio/*,.mp3,.wav,.aac,.m4a" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
      </div>
      {error && <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  );
}
