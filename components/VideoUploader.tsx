"use client";
import { useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMediaUrl } from "@/lib/getMediaUrl";

type Props = {
  currentUrl: string | null;
  onUploaded: (url: string) => void;
};

const MAX_FILE_BYTES = 40 * 1024 * 1024;
const ACCEPTED_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export function VideoUploader({ currentUrl, onUploaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function validate(file: File): string | null {
    if (!ACCEPTED_TYPES.includes(file.type)) return "Only MP4, WEBM, or MOV videos are supported.";
    if (file.size > MAX_FILE_BYTES) return "Video is too large - max 40MB. Keep hero videos short.";
    return null;
  }

  function handleFile(file: File) {
    const err = validate(file);
    if (err) { setError(err); return; }
    setError("");
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      const res = await fetch("/api/upload-video", { method: "POST", body: formData });
      const raw = await res.text();
      let data: { url?: string; fileName?: string; fileSize?: number; error?: { message?: string } } = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch {
        throw new Error(!res.ok ? (raw.slice(0, 120) || `Upload failed (status ${res.status})`) : "Upload failed - unexpected server response");
      }
      if (!res.ok || data.error || !data.url) {
        throw new Error(data?.error?.message || "Upload failed");
      }
      onUploaded(data.url);
      const supabase = createSupabaseBrowserClient();
      supabase.from("media_assets").insert({
        file_name: data.fileName,
        media_type: "video",
        file_url: data.url,
        file_size: data.fileSize,
      }).then(({ error: insertErr }) => { if (insertErr) console.error("Failed to log media_asset:", insertErr); });
      setPendingFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed - please try again.");
    } finally {
      setUploading(false);
    }
  }

  function clearPending() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(null);
    setPreviewUrl(null);
    setError("");
  }

  const displayUrl = previewUrl || getMediaUrl(currentUrl);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {displayUrl && (
        <div style={{ position: "relative", maxWidth: 280 }}>
          <video src={displayUrl} controls muted style={{ width: "100%", borderRadius: 10, border: "1px solid rgba(190,38,193,0.3)", display: "block" }} />
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          padding: "18px 16px", borderRadius: 10, textAlign: "center", cursor: "pointer",
          border: "2px dashed " + (dragging ? "#BE26C1" : "rgba(190,38,193,0.4)"),
          background: dragging ? "rgba(190,38,193,0.1)" : "rgba(255,255,255,0.03)",
          fontSize: 13, color: "rgba(255,255,255,0.6)",
        }}
      >
        {displayUrl ? "Drop a new video here or click to replace" : "Drop a video here or click to upload (MP4, WEBM, MOV, max 40MB)"}
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {pendingFile && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={handleUpload} disabled={uploading} style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(34,197,94,0.25)", border: "1px solid #22c55e", color: "#fff", fontSize: 12, fontWeight: 700, cursor: uploading ? "default" : "pointer" }}>
            {uploading ? "Uploading..." : "Save Video"}
          </button>
          <button type="button" onClick={clearPending} style={{ padding: "6px 12px", borderRadius: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)", fontSize: 12, cursor: "pointer" }}>Cancel</button>
        </div>
      )}

      {error && <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  );
}
