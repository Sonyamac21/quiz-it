"use client";
import { useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMediaUrl } from "@/lib/getMediaUrl";

type Props = {
  currentUrl: string | null;
  onUploaded: (url: string) => void;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Rotates an image client-side by the given degrees (90/180/270) using a canvas,
// returning a new File ready to upload - lets the host fix a sideways phone
// photo before it ever reaches the server.
async function rotateFile(file: File, degrees: number): Promise<File> {
  const img = document.createElement("img");
  const url = URL.createObjectURL(file);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
  const rad = (degrees * Math.PI) / 180;
  const swap = degrees % 180 !== 0;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? img.height : img.width;
  canvas.height = swap ? img.width : img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  URL.revokeObjectURL(url);
  const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), file.type || "image/jpeg", 0.95));
  return new File([blob], file.name, { type: file.type || "image/jpeg" });
}

// Downscales a large photo client-side (longest edge capped, re-encoded at
// 85% quality) before it ever leaves the browser. Phone camera photos can
// easily be 5-15MB - well past what a Vercel serverless function will
// accept as a request body - so this keeps uploads reliable regardless of
// how big the original photo is. The server still does its own resize/WEBP
// conversion; this just makes sure the request is small enough to arrive.
const MAX_UPLOAD_EDGE = 2000;
async function downscaleIfNeeded(file: File): Promise<File> {
  const img = document.createElement("img");
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });
    if (img.width <= MAX_UPLOAD_EDGE && img.height <= MAX_UPLOAD_EDGE && file.size <= 4 * 1024 * 1024) {
      return file;
    }
    const scale = Math.min(1, MAX_UPLOAD_EDGE / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85));
    return new File([blob], file.name, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ImageUploader({ currentUrl, onUploaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function validate(file: File): string | null {
    if (!ACCEPTED_TYPES.includes(file.type)) return "Only JPG, PNG, or WEBP images are supported.";
    if (file.size > MAX_FILE_BYTES) return "Image is too large - max 10MB.";
    return null;
  }

  async function handleFile(file: File) {
    const err = validate(file);
    if (err) { setError(err); return; }
    setError("");
    const ready = await downscaleIfNeeded(file);
    setPendingFile(ready);
    setPreviewUrl(URL.createObjectURL(ready));
  }

  async function handleRotate(degrees: number) {
    if (!pendingFile) return;
    const rotated = await rotateFile(pendingFile, degrees);
    setPendingFile(rotated);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(rotated));
  }

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      const res = await fetch("/api/upload-image", { method: "POST", body: formData });
      const raw = await res.text();
      let data: { url?: string; fileName?: string; fileSize?: number; error?: { message?: string } } = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch {
        // Server (or the platform in front of it) returned a non-JSON body -
        // e.g. a plain-text 413 "Request Entity Too Large" when a photo is
        // too big for the request limit. Surface that text directly instead
        // of crashing with a JSON parse error.
        throw new Error(!res.ok ? (raw.slice(0, 120) || `Upload failed (status ${res.status})`) : "Upload failed - unexpected server response");
      }
      if (!res.ok || data.error || !data.url) {
        throw new Error(data?.error?.message || "Upload failed");
      }
      onUploaded(data.url);
      const supabase = createSupabaseBrowserClient();
      supabase.from("media_assets").insert({
        file_name: data.fileName,
        media_type: "image",
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
          <img src={displayUrl} alt="Question" style={{ width: "100%", borderRadius: 10, border: "1px solid rgba(190,38,193,0.3)", display: "block" }} />
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
        {displayUrl ? "Drop a new image here or click to replace" : "Drop an image here or click to upload (JPG, PNG, WEBP, max 10MB)"}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {pendingFile && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => handleRotate(90)} style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 12, cursor: "pointer" }}>{"Rotate \u21bb"}</button>
          <button type="button" onClick={() => handleRotate(270)} style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 12, cursor: "pointer" }}>{"Rotate \u21ba"}</button>
          <button type="button" onClick={handleUpload} disabled={uploading} style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(34,197,94,0.25)", border: "1px solid #22c55e", color: "#fff", fontSize: 12, fontWeight: 700, cursor: uploading ? "default" : "pointer" }}>
            {uploading ? "Uploading..." : "Save Image"}
          </button>
          <button type="button" onClick={clearPending} style={{ padding: "6px 12px", borderRadius: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)", fontSize: 12, cursor: "pointer" }}>Cancel</button>
        </div>
      )}

      {error && <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  );
}
