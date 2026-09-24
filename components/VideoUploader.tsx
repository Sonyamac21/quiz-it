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
// iPhone Camera Roll videos are .mov (HEVC), and depending on iOS version
// and how the file reached the browser (Photos picker, Files app, AirDrop,
// share sheet), Safari/Mobile Safari sometimes reports file.type as an
// empty string or a generic "application/octet-stream" instead of
// "video/quicktime" - the exact same class of bug already fixed for HEIC
// photos in ImageUploader. That made every genuine iPhone hero-video
// upload get rejected with "Only MP4, WEBM, or MOV videos are supported,"
// which read as broken support for the most common source of these videos.
// Falling back to the file extension when the MIME type is missing/generic
// covers that case without loosening validation for anything else.
function isLikelyVideoFile(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  // Previous version only fell back to the extension when file.type was
  // empty or exactly "application/octet-stream" - but real devices report
  // a wider, messier range of non-standard video MIME types than that (a
  // codec-qualified type, a vendor-specific string, etc.), and any of
  // those still got rejected outright without ever checking the
  // extension. That's almost certainly why the fix "worked" for the HEVC
  // .mov case tested first but a hero-video upload could still fail with
  // this exact error afterward. Trusting the file extension whenever the
  // reported type isn't one of the three we explicitly recognise is far
  // more reliable than trying to enumerate every device/browser's MIME
  // quirks - the server already re-derives the real content-type the
  // same way as a backstop.
  if (/\.(mov|mp4|m4v|webm|3gp|avi)$/i.test(file.name)) return true;
  // Last resort: any type the browser itself calls a video (e.g. a
  // codec-qualified or vendor-specific "video/..." string this app
  // doesn't explicitly know) is still a video - trust that over
  // rejecting a file that's clearly not one of the risky cases (an
  // actual non-video file would never get a "video/..." type at all).
  return file.type.startsWith("video/");
}

export function VideoUploader({ currentUrl, onUploaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function validate(file: File): string | null {
    if (!isLikelyVideoFile(file)) return "Only MP4, WEBM, or MOV videos are supported.";
    if (file.size > MAX_FILE_BYTES) return "Video is too large - max 40MB. Keep hero videos short.";
    return null;
  }

  // Same trap as ImageUploader (see its handleFile comment) - dropping/
  // selecting a file only staged a local preview; the actual upload
  // required a separate "Save Video" click, which is exactly the kind of
  // hidden extra step behind "it's not saving media for this venue"
  // reports. Auto-uploading the instant a file is ready removes it here too.
  async function handleFile(file: File) {
    const err = validate(file);
    if (err) { setError(err); return; }
    setError("");
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    await handleUpload(file);
  }

  async function handleUpload(fileToUpload?: File) {
    const file = fileToUpload || pendingFile;
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed - please try again.");
    } finally {
      setUploading(false);
    }
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
          accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {pendingFile && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: uploading ? "#FFC533" : "#2EE06E" }}>{uploading ? "Saving…" : "✓ Saved"}</span>
        </div>
      )}

      {error && <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  );
}
