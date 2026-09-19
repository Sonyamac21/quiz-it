"use client";
import { useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { prepareParticipantPhoto } from "@/lib/images/prepareParticipantPhoto";

// Lets a team snap/upload a photo taken during the quiz night, separate from
// the one photo they set at join. Every upload lands in session_photos with
// approved=false - it never appears anywhere (display gallery, etc.) until a
// host approves it on the live console's Photos panel. This component only
// handles the submit step; it has no idea whether the photo is later shown.
type Props = { sessionPin: string; teamName: string };
type Status = "idle" | "uploading" | "sent" | "error";

// Always rendered open at a fixed height, no collapse/expand toggle - a
// collapsible version changed size depending on whether it was open,
// which made the venue promo photo above it (sized to fill whatever
// leftover space this strip left behind) jump around or get pushed off
// the top of the screen. Keeping this strip's size constant keeps that
// photo's size constant too.
export function TeamPhotoUpload({ sessionPin, teamName }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setStatus("uploading");
    setError("");
    const supabase = createSupabaseBrowserClient();
    try {
      const preparedPhoto = await prepareParticipantPhoto(file);
      const { data: session } = await supabase.from("sessions").select("id").eq("pin", sessionPin).maybeSingle();
      if (!session?.id) throw new Error("Could not find this session");
      const path = sessionPin + "-" + teamName.trim().replace(/\s+/g, "-").toLowerCase() + "-" + Date.now() + ".jpg";
      const { error: uploadError } = await supabase.storage.from("session-photos").upload(path, preparedPhoto, {
        contentType: "image/jpeg",
        cacheControl: "3600",
      });
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

  return (
    <div style={{ padding: "18px 16px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(190,38,193,0.3)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, width: "100%" }}>
      {status !== "sent" && <span style={{ fontSize: 13, color: "#D94FDC", fontWeight: 700, letterSpacing: 1, whiteSpace: "nowrap", flexShrink: 0 }}>SHARE PHOTO</span>}
      {status === "sent" ? (
        <div style={{ display: "flex", alignItems: "center", flex: 1, gap: 14, minWidth: 0 }}>
          <div style={{ fontSize: 15, color: "#2ee06e", fontWeight: 600, flex: 1, whiteSpace: "nowrap" }}>Thanks!</div>
          <button onClick={() => setStatus("idle")} style={{ flexShrink: 0, padding: "10px 14px", borderRadius: 10, background: "rgba(190,38,193,0.2)", border: "1.5px solid #BE26C1", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            Share Another
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, gap: 10, minWidth: 0 }}>
          <label style={{ flex: 1, padding: "14px 10px", borderRadius: 10, background: "rgba(190,38,193,0.2)", border: "1.5px solid #BE26C1", color: "#fff", fontSize: 14, fontWeight: 600, textAlign: "center" as const, cursor: "pointer", whiteSpace: "nowrap" }}>
            {status === "uploading" ? "Uploading…" : "Take Photo"}
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
          <label style={{ flex: 1, padding: "14px 10px", borderRadius: 10, background: "rgba(190,38,193,0.2)", border: "1.5px solid #BE26C1", color: "#fff", fontSize: 14, fontWeight: 600, textAlign: "center" as const, cursor: "pointer", whiteSpace: "nowrap" }}>
            Camera Roll
            <input type="file" accept="image/*" style={{ display: "none" }} disabled={status === "uploading"}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
          {status === "error" && <div style={{ fontSize: 12, color: "#ff8290", flexShrink: 0, alignSelf: "center" }}>{error}</div>}
        </div>
      )}
    </div>
  );
}
