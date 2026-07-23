"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Every photo a customer submits - a team's join photo, or a quiz-night
// upload - lands here before it can appear anywhere else (handset badge,
// display winner reveal, share cards, the intermission gallery). Nothing is
// shown to the room without a host explicitly approving it first. This is a
// safety requirement (see 202607230002_photo_approval), not a nicety, so
// this panel intentionally has no "approve all" shortcut.
type PendingJoinPhoto = { kind: "team"; id: string; team_name: string; photo_url: string };
type PendingUpload = { kind: "upload"; id: string; team_name: string; photo_url: string };
type PendingPhoto = PendingJoinPhoto | PendingUpload;

type Props = {
  sessionId: string;
  sessionPin: string;
};

const POLL_MS = 4000;

export function PhotoApprovalPanel({ sessionId, sessionPin }: Props) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !sessionPin) return;
    let cancelled = false;
    async function load() {
      const [{ data: teamRows }, { data: uploadRows }] = await Promise.all([
        supabase.from("teams").select("id, team_name, photo_url, photo_approved").eq("session_pin", sessionPin).eq("photo_approved", false).not("photo_url", "is", null),
        supabase.from("session_photos").select("id, team_name, photo_url").eq("session_id", sessionId).eq("approved", false).eq("rejected", false).order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      const teamPending: PendingJoinPhoto[] = (teamRows || []).map(t => ({ kind: "team", id: t.id, team_name: t.team_name, photo_url: t.photo_url as string }));
      const uploadPending: PendingUpload[] = (uploadRows || []).map(u => ({ kind: "upload", id: u.id, team_name: u.team_name, photo_url: u.photo_url }));
      setPending([...teamPending, ...uploadPending]);
    }
    load();
    const interval = window.setInterval(load, POLL_MS);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [sessionId, sessionPin, supabase]);

  async function approve(photo: PendingPhoto) {
    setBusyId(photo.id);
    setError(null);
    const table = photo.kind === "team" ? "teams" : "session_photos";
    const patch = photo.kind === "team" ? { photo_approved: true } : { approved: true, moderated_at: new Date().toISOString() };
    const { error: updateError } = await supabase.from(table).update(patch).eq("id", photo.id);
    if (updateError) { setError("Could not approve: " + updateError.message); setBusyId(null); return; }
    setPending(prev => prev.filter(p => p.id !== photo.id));
    setBusyId(null);
  }

  async function reject(photo: PendingPhoto) {
    setBusyId(photo.id);
    setError(null);
    // A rejected team join photo is simply cleared - the team keeps their
    // initials badge instead, same as never having uploaded one. A rejected
    // quiz-night upload is flagged rejected rather than deleted, so it can't
    // be resubmitted or approved by accident later.
    const { error: updateError } = photo.kind === "team"
      ? await supabase.from("teams").update({ photo_url: null, photo_approved: false }).eq("id", photo.id)
      : await supabase.from("session_photos").update({ rejected: true, moderated_at: new Date().toISOString() }).eq("id", photo.id);
    if (updateError) { setError("Could not reject: " + updateError.message); setBusyId(null); return; }
    setPending(prev => prev.filter(p => p.id !== photo.id));
    setBusyId(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="qi-button"
        style={{ position: "relative" }}
        aria-haspopup="dialog"
      >
        Photos
        {pending.length > 0 && (
          <span style={{ position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, background: "#ff3b4e", color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
            {pending.length}
          </span>
        )}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(5,2,10,0.97)", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", padding: 24, overflowY: "auto" }}>
          <div style={{ width: "100%", maxWidth: 720, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ font: "800 22px 'Inter'", color: "#fff" }}>Photo approval</div>
            <button onClick={() => setOpen(false)} className="qi-button">Close</button>
          </div>
          <div style={{ width: "100%", maxWidth: 720, color: "#B9A8D9", fontSize: 13, marginBottom: 16 }}>
            Nothing here reaches the display, a handset badge, or a share card until you approve it.
          </div>
          {error && <div style={{ width: "100%", maxWidth: 720, padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.5)", color: "#ef4444", fontSize: 13, marginBottom: 16 }}>{error}</div>}
          {pending.length === 0 ? (
            <div style={{ color: "#6B5A8E", font: "600 14px 'Inter'", marginTop: 40 }}>Nothing waiting for review.</div>
          ) : (
            <div style={{ width: "100%", maxWidth: 720, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
              {pending.map(photo => (
                <div key={photo.kind + photo.id} style={{ borderRadius: 16, background: "#150A2E", border: "1px solid #2E1A52", overflow: "hidden" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.photo_url} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                  <div style={{ padding: 12 }}>
                    <div style={{ font: "700 14px 'Inter'", color: "#fff", marginBottom: 2 }}>{photo.team_name}</div>
                    <div style={{ font: "500 11px 'Inter'", color: "#6B5A8E", marginBottom: 10, letterSpacing: 1, textTransform: "uppercase" as const }}>{photo.kind === "team" ? "Join photo" : "Quiz-night upload"}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => approve(photo)}
                        disabled={busyId === photo.id}
                        style={{ flex: 1, padding: "8px 0", borderRadius: 10, background: "rgba(46,224,110,0.18)", border: "1px solid #2ee06e", color: "#2ee06e", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => reject(photo)}
                        disabled={busyId === photo.id}
                        style={{ flex: 1, padding: "8px 0", borderRadius: 10, background: "rgba(255,59,78,0.14)", border: "1px solid #ff3b4e", color: "#ff8290", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
