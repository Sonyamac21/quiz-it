"use client";
import { useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Lets a team snap/upload a photo taken during the quiz night, separate from
// the one photo they set at join. Every upload lands in session_photos with
// approved=false - it never appears anywhere (display gallery, etc.) until a
// host approves it on the live console's Photos panel. This component only
// handles the submit step; it has no idea whether the photo is later shown.
type Props = { sessionPin: string; teamName: string };
type Status = "idle" | "uploading" | "sent" | "error";

export function TeamPhotoUpload({ sessionPin, teamName }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setStatus("uploading");
    setError("");
    const supabase = createSupabaseBrowserClient();
    try {
      const { data: session } = await supabase.from("sessions").select("id").eq("pin", sessionPin).maybeSingle();
      if (!session?.id) throw new Error("Could not find this session");
      const ext = file.name.split(".").pop() || "jpg";
      const path = sessionPin + "-" + teamName.trim().replace(/\s+/g, "-").toLowerCase() + "-" + Date.now() + "." + ext;
      const { error: uploadError } = await supabase.storage.from("session-photos").upload(path, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("session-photos").getPublicUrl(path);
      const { error: insertError } = await supabase.from("session_photos").insert({
        session_id: session.id,
        session_pin: sessionPin,
        team_name: teamName,
        photo_url: urlData.publicUrl,
      });
      if (insertError) throw insertError;
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Upload failed - please try again");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ padding: "8px 14px", borderRadius: 10, background: "rgba(190,38,193,0.15)", border: "1px solid rgba(190,38,193,0.4)", color: "#D94FDC", fontSize: 12, fontWeight: 700, letterSpacing: 1, cursor: "pointer", flexShrink: 0 }}
      >
        📷 Add Photo
      </button>
    );
  }

  return (
    <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(190,38,193,0.3)", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: "#D94FDC", fontWeight: 700, letterSpacing: 1 }}>SHARE A QUIZ NIGHT PHOTO</span>
        <button onClick={() => { setOpen(false); setStatus("idle"); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Close</button>
      </div>
      {status === "sent" ? (
        <div style={{ fontSize: 13, color: "#2ee06e" }}>Sent to the host for approval - thanks!</div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>The host checks every photo before it shows on screen.</div>
          <label style={{ padding: "10px 16px", borderRadius: 10, background: "rgba(190,38,193,0.2)", border: "1.5px solid #BE26C1", color: "#fff", fontSize: 13, textAlign: "center" as const, cursor: "pointer" }}>
            {status === "uploading" ? "Uploading…" : "Choose Photo"}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              disabled={status === "uploading"}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </label>
          {status === "error" && <div style={{ fontSize: 12, color: "#ff8290" }}>{error}</div>}
        </>
      )}
    </div>
  );
}
