"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { HostShell, HostButton, HostInput, HostLabel, HostLoading, TopSpacer } from "@/components/fable/HostConsole";

const BG = "radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118";
type Venue = { id: string; day_of_week: number; venue_name: string; venue_logo_url: string | null; address: string | null; active: boolean; default_start_time: string | null; default_brand_kit: string | null; default_music_pack: string | null; notes: string | null };
const empty = { venue_name: "", address: "", default_start_time: "", default_brand_kit: "", default_music_pack: "", notes: "" };

export default function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error: loadError } = await createSupabaseBrowserClient().from("venues").select("id,day_of_week,venue_name,venue_logo_url,address,active,default_start_time,default_brand_kit,default_music_pack,notes").order("venue_name");
    if (loadError) setError("Venue migration is required. " + loadError.message);
    setVenues((data ?? []) as Venue[]); setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function createVenue() {
    if (!form.venue_name.trim()) return;
    setSaving(true); setError("");
    const nextLegacyKey = venues.reduce((max, venue) => Math.max(max, venue.day_of_week), -1) + 1;
    const { error: saveError } = await createSupabaseBrowserClient().from("venues").insert({ day_of_week: nextLegacyKey, venue_name: form.venue_name.trim(), address: form.address.trim() || null, active: true, default_start_time: form.default_start_time || null, default_brand_kit: form.default_brand_kit.trim() || null, default_music_pack: form.default_music_pack.trim() || null, notes: form.notes.trim() || null });
    if (saveError) setError(saveError.message); else { setForm(empty); await load(); }
    setSaving(false);
  }

  async function updateVenue(id: string, changes: Partial<Venue>) {
    const { error: saveError } = await createSupabaseBrowserClient().from("venues").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", id);
    if (saveError) setError(saveError.message); else setVenues(previous => previous.map(venue => venue.id === id ? { ...venue, ...changes } : venue));
  }

  return <HostShell><main style={{ minHeight: "100vh", background: BG, color: "#fff", padding: "24px 32px" }}>
    <div className="fbh-top"><span className="fbh-wm"><span className="q">QUIZ-</span>IT</span><span className="fbh-bc">Venue Manager</span><TopSpacer /><a className="fbh-btn" href="/host/events">Events</a><a className="fbh-btn pri" href="/host/events/new">Create Event</a></div>
    {loading ? <HostLoading title="Venue Manager" note="Loading saved venues…" /> : <div className="qi-quiz-builder-grid">
      <section className="fbh-panel"><div className="fbh-lbl">Add Venue</div><HostLabel>Name</HostLabel><HostInput value={form.venue_name} onChange={e => setForm(value => ({ ...value, venue_name: e.target.value }))} placeholder="Venue name" /><HostLabel>Address or Location</HostLabel><HostInput value={form.address} onChange={e => setForm(value => ({ ...value, address: e.target.value }))} placeholder="Optional" /><HostLabel>Default Start Time</HostLabel><HostInput type="time" value={form.default_start_time} onChange={e => setForm(value => ({ ...value, default_start_time: e.target.value }))} /><HostLabel>Default Brand Kit</HostLabel><HostInput value={form.default_brand_kit} onChange={e => setForm(value => ({ ...value, default_brand_kit: e.target.value }))} /><HostLabel>Default Music Pack</HostLabel><HostInput value={form.default_music_pack} onChange={e => setForm(value => ({ ...value, default_music_pack: e.target.value }))} /><HostLabel>Notes</HostLabel><textarea className="fbh-input" rows={3} style={{ width: "100%" }} value={form.notes} onChange={e => setForm(value => ({ ...value, notes: e.target.value }))} /><HostButton variant="pri" big onClick={createVenue} disabled={!form.venue_name.trim() || saving} style={{ width: "100%", marginTop: 12 }}>{saving ? "SAVING…" : "ADD VENUE"}</HostButton>{error && <div role="alert" style={{ color: "#D94FDC", marginTop: 10 }}>{error}</div>}</section>
      <section><div className="fbh-lbl">Saved Venues</div>{venues.map(venue => <article className="fbh-panel" key={venue.id} style={{ opacity: venue.active ? 1 : .58 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><div><strong style={{ font: "800 17px Inter" }}>{venue.venue_name}</strong><div style={{ color: "#B9A8D9", marginTop: 5 }}>{venue.address || "No location recorded"}</div><div style={{ color: "#6B5A8E", marginTop: 5, fontSize: 12 }}>{venue.default_start_time ? `Default ${venue.default_start_time.slice(0,5)}` : "No default time"}{venue.default_brand_kit ? ` · ${venue.default_brand_kit}` : ""}{venue.default_music_pack ? ` · ${venue.default_music_pack}` : ""}</div></div><HostButton onClick={() => updateVenue(venue.id, { active: !venue.active })}>{venue.active ? "DEACTIVATE" : "ACTIVATE"}</HostButton></div></article>)}</section>
    </div>}
  </main></HostShell>;
}
