"use client";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useConfirmDialog, useToastQueue } from "@/components/ui/quiz-it-ui";

type VictorySong = {
  id: string;
  title: string;
  file_ref: string;
  sort_order: number;
  is_active: boolean;
};

export default function VictorySongsPage() {
  const [songs, setSongs] = useState<VictorySong[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const { confirm, dialog: confirmDialogEl } = useConfirmDialog();
  const { showToast, toastEl } = useToastQueue();

  useEffect(() => {
    let cancelled = false;
    void createSupabaseBrowserClient()
      .from("victory_songs")
      .select("id,title,file_ref,sort_order,is_active")
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) showToast("Couldn't load songs: " + error.message, "error");
        setSongs((data || []) as VictorySong[]);
        setLoading(false);
      });
    return () => { cancelled = true; };
    // The catalogue is loaded once when this management page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveRename(id: string) {
    const title = editTitle.trim();
    if (!title) { setEditingId(null); return; }
    setSavingId(id);
    const { error } = await createSupabaseBrowserClient().from("victory_songs").update({ title }).eq("id", id);
    setSavingId(null);
    if (error) { showToast("Rename failed: " + error.message, "error"); return; }
    setSongs(prev => prev.map(s => s.id === id ? { ...s, title } : s));
    setEditingId(null);
    showToast("Renamed.", "success");
  }

  async function toggleActive(song: VictorySong) {
    const { error } = await createSupabaseBrowserClient().from("victory_songs").update({ is_active: !song.is_active }).eq("id", song.id);
    if (error) { showToast("Couldn't update: " + error.message, "error"); return; }
    setSongs(prev => prev.map(s => s.id === song.id ? { ...s, is_active: !s.is_active } : s));
  }

  async function deleteSong(song: VictorySong) {
    const ok = await confirm(`Remove "${song.title}" from the victory song list? Any team that already picked it this session keeps their existing pick - this only affects new joins.`, { title: "Remove song", confirmLabel: "Remove", tone: "destructive" });
    if (!ok) return;
    const { error } = await createSupabaseBrowserClient().from("victory_songs").delete().eq("id", song.id);
    if (error) { showToast("Couldn't remove: " + error.message, "error"); return; }
    setSongs(prev => prev.filter(s => s.id !== song.id));
    showToast("Removed.", "success");
  }

  async function uploadNewSong(file: File) {
    if (!newTitle.trim()) { showToast("Give the track a title first.", "error"); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload-audio", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Upload failed");
      const maxOrder = songs.reduce((max, s) => Math.max(max, s.sort_order), -1);
      const { data: inserted, error } = await createSupabaseBrowserClient()
        .from("victory_songs")
        .insert({ title: newTitle.trim(), file_ref: data.url, sort_order: maxOrder + 1, is_active: true })
        .select("id,title,file_ref,sort_order,is_active")
        .single();
      if (error) throw new Error(error.message);
      setSongs(prev => [...prev, inserted as VictorySong]);
      setNewTitle("");
      showToast("Added to the list.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  }

  const normaliseSearch = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const searchNeedle = normaliseSearch(search);
  const filtered = songs.filter(s => !searchNeedle || normaliseSearch(s.title).includes(searchNeedle));

  return (
    <main className="qi-bo-page">
      {confirmDialogEl}
      {toastEl}
      <header className="qi-bo-pagehead">
        <div>
          <p>Join Screen</p>
          <h1>Victory Songs</h1>
          <span>{songs.length} track{songs.length === 1 ? "" : "s"} · this is the list every team picks from when they join a session. Rename, retire, or add tracks here - no code changes needed.</span>
        </div>
      </header>

      <div className="fbh-panel" style={{ padding: 16, marginBottom: 24 }}>
        <div className="fbh-lbl" style={{ margin: "0 0 10px" }}>Add a new song</div>
        <p style={{ margin: "0 0 12px", color: "rgba(255,255,255,.62)", fontSize: 13 }}>Enter the title, then select the audio file from this device. This adds a new choice; it does not search Spotify or the web.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="qi-bo-input"
            style={{ marginBottom: 0, width: "min(100%,360px)" }}
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Song title, e.g. Dancing Queen - ABBA"
          />
          <label style={{ display: "inline-block", padding: "10px 16px", borderRadius: 10, background: "#150A2E", border: "1px dashed #2E1A52", color: "#D9CCF2", cursor: uploading ? "default" : "pointer", fontSize: 13 }}>
            {uploading ? "Uploading…" : "+ Upload MP3"}
            <input
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a"
              style={{ display: "none" }}
              disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) void uploadNewSong(f); e.target.value = ""; }}
            />
          </label>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Max 15MB. Give it a title first, then choose the file.</span>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label className="fbh-lbl" htmlFor="victory-song-filter" style={{ display: "block", margin: "0 0 8px" }}>Filter saved songs</label>
        <input id="victory-song-filter" className="qi-bo-input" style={{ marginBottom: 0, width: "100%" }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Type a title or artist, e.g. Pink" />
      </div>

      {loading ? (
        <div className="qi-bo-empty"><strong>Loading…</strong></div>
      ) : filtered.length === 0 ? (
        <div className="qi-bo-empty"><strong>{songs.length === 0 ? "No victory songs have been saved" : "No saved songs match this filter"}</strong><span>{songs.length === 0 ? "Add a title and audio file above." : "Clear the filter or try the artist's name without punctuation."}</span></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(song => (
            <div key={song.id} className="qi-bo-card" style={{ display: "flex", alignItems: "center", gap: 12, opacity: song.is_active ? 1 : 0.5 }}>
              {editingId === song.id ? (
                <input
                  className="qi-bo-input"
                  style={{ marginBottom: 0, flex: 1 }}
                  value={editTitle}
                  autoFocus
                  onChange={e => setEditTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") void saveRename(song.id); if (e.key === "Escape") setEditingId(null); }}
                />
              ) : (
                <strong style={{ flex: 1, fontSize: 14 }}>{song.title}</strong>
              )}

              {!song.is_active && <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", color: "#B9A8D9" }}>HIDDEN</span>}

              {editingId === song.id ? (
                <>
                  <button className="fbh-btn" type="button" disabled={savingId === song.id} onClick={() => void saveRename(song.id)}>{savingId === song.id ? "Saving…" : "Save"}</button>
                  <button className="fbh-btn" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <button className="fbh-btn" type="button" onClick={() => { setEditingId(song.id); setEditTitle(song.title); }}>Rename</button>
                  <button className="fbh-btn" type="button" onClick={() => void toggleActive(song)}>{song.is_active ? "Hide" : "Unhide"}</button>
                  <button className="fbh-btn" type="button" onClick={() => void deleteSong(song)}>Remove</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
