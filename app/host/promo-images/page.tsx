"use client";
// PROMO IMAGES - one upload, then flip where it shows. Each image has two
// independent toggles ("Handset" / "Display") backed by the venue_offers
// row's `surface` column ("handset" | "display" | "both") - no need to
// upload the same photo twice to put it on both surfaces. Two sections:
// per-venue images (only rotate for the venue selected) and generic images
// (rotate at every venue). Moved out from under the Venues page since
// offers aren't really a "venue profile" field.
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMediaUrl } from "@/lib/getMediaUrl";
import type { OfferSurface } from "@/lib/venueOffers";

type Venue = { id: string; venue_name: string };
type Offer = { id: string; venue_id: string | null; image_url: string; active: boolean; sort_order: number; surface: OfferSurface };

const MAX_UPLOAD_EDGE = 2000;
// Same HEIC/oversize handling every other uploader on this app does - a raw
// phone photo can be well past what the server's upload route will accept.
async function prepareImage(file: File): Promise<File> {
  const isHeic = file.type === "image/heic" || file.type === "image/heif" || /\.(heic|heif)$/i.test(file.name);
  const img = document.createElement("img");
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = url; });
    if (!isHeic && img.width <= MAX_UPLOAD_EDGE && img.height <= MAX_UPLOAD_EDGE && file.size <= 4 * 1024 * 1024) return file;
    const scale = Math.min(1, MAX_UPLOAD_EDGE / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob: Blob = await new Promise(resolve => canvas.toBlob(b => resolve(b!), "image/jpeg", 0.85));
    return new File([blob], file.name.replace(/\.(heic|heif)$/i, "") + ".jpg", { type: "image/jpeg" });
  } finally { URL.revokeObjectURL(url); }
}

function hasSurface(offer: Offer, target: "handset" | "display"): boolean {
  return offer.surface === target || offer.surface === "both";
}
// Flips one of the two targets on/off for this image and returns the next
// surface value. Won't let both be switched off - an image with nowhere to
// show is confusing, so switching off the last remaining target is a no-op.
function toggledSurface(current: OfferSurface, target: "handset" | "display"): OfferSurface {
  const handsetOn = hasSurface({ surface: current } as Offer, "handset");
  const displayOn = hasSurface({ surface: current } as Offer, "display");
  const nextHandset = target === "handset" ? !handsetOn : handsetOn;
  const nextDisplay = target === "display" ? !displayOn : displayOn;
  if (!nextHandset && !nextDisplay) return current; // no-op, keep at least one
  if (nextHandset && nextDisplay) return "both";
  return nextHandset ? "handset" : "display";
}

function SurfaceToggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ flex: 1, padding: "5px 6px", borderRadius: 7, background: on ? "rgba(190,38,193,0.18)" : "rgba(255,255,255,0.05)", border: "1px solid " + (on ? "#BE26C1" : "#2E1A52"), color: on ? "#D94FDC" : "#6B5A8E", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
      {on ? "✓ " : ""}{label}
    </button>
  );
}

function OfferCard({ offer, onDelete, onToggleActive, onToggleSurface, onDrop }: {
  offer: Offer; onDelete: () => void; onToggleActive: () => void; onToggleSurface: (target: "handset" | "display") => void; onDrop: (draggedId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData("text/plain", offer.id); e.dataTransfer.effectAllowed = "move"; }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); onDrop(e.dataTransfer.getData("text/plain")); }}
      style={{ borderRadius: 12, overflow: "hidden", border: "1px solid " + (dragOver ? "#BE26C1" : offer.active ? "#2E1A52" : "#5A1B1B"), opacity: offer.active ? 1 : 0.55, cursor: "grab" }}
    >
      <div style={{ position: "relative", width: "100%", aspectRatio: "1", background: "#0A0118" }}>
        <Image unoptimized fill sizes="200px" style={{ objectFit: "cover" }} src={getMediaUrl(offer.image_url) || offer.image_url} alt="Promo image" />
        <div style={{ position: "absolute", top: 6, left: 6, padding: "2px 6px", borderRadius: 6, background: "rgba(10,1,24,0.7)", color: "#D9CCF2", fontSize: 14, letterSpacing: 2 }}>⠿⠿</div>
      </div>
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6, background: "#150A2E" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <SurfaceToggle label="Handset" on={hasSurface(offer, "handset")} onClick={() => onToggleSurface("handset")} />
          <SurfaceToggle label="Display" on={hasSurface(offer, "display")} onClick={() => onToggleSurface("display")} />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onToggleActive} style={{ flex: 1, padding: "6px 8px", borderRadius: 8, background: offer.active ? "rgba(46,224,110,0.15)" : "rgba(255,255,255,0.06)", border: "1px solid " + (offer.active ? "#2EE06E" : "#2E1A52"), color: offer.active ? "#2EE06E" : "#6B5A8E", fontSize: 12, cursor: "pointer" }}>{offer.active ? "Active" : "Paused"}</button>
          <button onClick={onDelete} style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(255,59,78,0.1)", border: "1px solid rgba(255,59,78,0.3)", color: "#FF7280", fontSize: 12, cursor: "pointer" }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function UploadTile({ busy, onFile }: { busy: boolean; onFile: (file: File) => void }) {
  return (
    <label style={{ display: "inline-block", padding: "10px 16px", borderRadius: 10, background: "#150A2E", border: "1px dashed #2E1A52", color: "#D9CCF2", cursor: "pointer", fontSize: 13 }}>
      {busy ? "Uploading…" : "+ Upload image"}
      <input type="file" accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </label>
  );
}

export default function PromoImagesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null); // "venue" | "generic" | null
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const [{ data: venueData }, { data: offerData }] = await Promise.all([
      supabase.from("venues").select("id,venue_name").order("venue_name"),
      supabase.from("venue_offers").select("id,venue_id,image_url,active,sort_order,surface").order("sort_order"),
    ]);
    setVenues((venueData || []) as Venue[]);
    setOffers((offerData || []) as Offer[]);
    setSelectedVenueId(prev => prev || (venueData || [])[0]?.id || "");
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // New uploads default to "both" - they show everywhere until you narrow
  // them down with the toggles, rather than silently defaulting to
  // handset-only and confusing anyone who forgets to check.
  async function upload(file: File, targetVenueId: string | null, busyKey: string) {
    setBusy(busyKey); setError("");
    try {
      const ready = await prepareImage(file);
      const formData = new FormData(); formData.append("file", ready);
      const res = await fetch("/api/upload-image", { method: "POST", body: formData });
      const raw = await res.text(); let data: { url?: string; error?: { message?: string } } = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error(!res.ok ? `Upload failed (server error ${res.status})` : "Upload failed - unexpected server response"); }
      if (!res.ok || data.error || !data.url) throw new Error(data?.error?.message || "Upload failed");
      const supabase = createSupabaseBrowserClient();
      const nextOrder = offers.filter(o => o.venue_id === targetVenueId).length;
      const { data: inserted, error: insertError } = await supabase.from("venue_offers").insert({ venue_id: targetVenueId, image_url: data.url, active: true, sort_order: nextOrder, surface: "both" }).select().single();
      if (insertError) setError(insertError.message); else setOffers(prev => [...prev, inserted as Offer]);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(null); }
  }
  async function deleteOffer(id: string) {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("venue_offers").delete().eq("id", id);
    setOffers(prev => prev.filter(o => o.id !== id));
  }
  async function toggleActive(offer: Offer) {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("venue_offers").update({ active: !offer.active }).eq("id", offer.id);
    setOffers(prev => prev.map(o => o.id === offer.id ? { ...o, active: !o.active } : o));
  }
  async function toggleSurface(offer: Offer, target: "handset" | "display") {
    const next = toggledSurface(offer.surface, target);
    if (next === offer.surface) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("venue_offers").update({ surface: next }).eq("id", offer.id);
    setOffers(prev => prev.map(o => o.id === offer.id ? { ...o, surface: next } : o));
  }
  async function reorder(orderedIds: string[]) {
    setOffers(prev => { const order = new Map(orderedIds.map((id, i) => [id, i])); return prev.map(o => order.has(o.id) ? { ...o, sort_order: order.get(o.id)! } : o); });
    const supabase = createSupabaseBrowserClient();
    await Promise.all(orderedIds.map((id, i) => supabase.from("venue_offers").update({ sort_order: i }).eq("id", id)));
  }

  function grid(list: Offer[], onFile: (file: File) => void, busyKey: string, emptyText: string) {
    return (
      <>
        <UploadTile busy={busy === busyKey} onFile={onFile} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12, marginTop: 12 }}>
          {list.map((o, i) => (
            <OfferCard key={o.id} offer={o} onDelete={() => deleteOffer(o.id)} onToggleActive={() => toggleActive(o)} onToggleSurface={target => toggleSurface(o, target)} onDrop={draggedId => {
              if (draggedId === o.id) return;
              const ids = list.map(x => x.id);
              const from = ids.indexOf(draggedId);
              if (from < 0) return;
              ids.splice(from, 1); ids.splice(i, 0, draggedId);
              reorder(ids);
            }} />
          ))}
          {list.length === 0 && <p style={{ color: "#6B5A8E", fontSize: 13 }}>{emptyText}</p>}
        </div>
      </>
    );
  }

  const genericOffers = useMemo(() => offers.filter(o => o.venue_id === null).slice().sort((a, b) => a.sort_order - b.sort_order), [offers]);
  const venueOffers = useMemo(() => offers.filter(o => o.venue_id === selectedVenueId).slice().sort((a, b) => a.sort_order - b.sort_order), [offers, selectedVenueId]);

  if (loading) return <main style={{ minHeight: "100vh", background: "#0A0118", display: "grid", placeItems: "center", color: "#fff" }}>Loading…</main>;

  return (
    <main className="qi-bo-page">
      <header className="qi-bo-pagehead">
        <div><p>Media &amp; Music</p><h1>Promo Images</h1><span>Upload once, then use the Handset/Display buttons on each image to pick where it rotates during intermission. Drag a tile to reorder.</span></div>
      </header>
      {error && <div className="qi-bo-alert" role="alert">{error}</div>}

      <section style={{ marginTop: 8, marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Per-venue images</h3>
          <select value={selectedVenueId} onChange={e => setSelectedVenueId(e.target.value)} style={{ background: "#150A2E", color: "#fff", border: "1px solid #2E1A52", borderRadius: 8, padding: "6px 10px", fontSize: 13 }}>
            {venues.map(v => <option key={v.id} value={v.id}>{v.venue_name}</option>)}
          </select>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6B5A8E" }}>Only rotate for the venue selected above.</p>
        {venues.length === 0 ? <p style={{ color: "#FFC533", fontSize: 13 }}>Add a venue first, then come back here to upload images just for it.</p> : grid(venueOffers, f => upload(f, selectedVenueId, "venue"), "venue", "No images uploaded for this venue yet.")}
      </section>

      <section>
        <h3 style={{ margin: "0 0 4px" }}>Generic images (rotate at every venue)</h3>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6B5A8E" }}>Show up everywhere, alongside whichever venue-specific images are active there.</p>
        {grid(genericOffers, f => upload(f, null, "generic"), "generic", "No generic images yet.")}
      </section>
    </main>
  );
}
