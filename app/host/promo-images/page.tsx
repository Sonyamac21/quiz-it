"use client";
// PROMO IMAGES - the single place to manage what rotates on player handsets
// (always) and the Display screen's intermission gallery (alongside each
// venue's own curated Display Slides/Adverts) during a live show's
// in-between-rounds break. Moved out from under the Venues page per host
// request - offers aren't really a "venue profile" field, they're closer to
// the other Media & Music content on this page.
//
// Three sections, matching how the venue_offers table actually works:
//   1. Per-venue images - only rotate for that one venue (venue_id set)
//   2. Generic images   - rotate at EVERY venue (venue_id = null)
//   3. Handset preview  - a live-styled preview of what a player's phone
//      actually shows during intermission (selected venue's images + every
//      generic image), so the host can check it before showtime instead of
//      guessing.
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMediaUrl } from "@/lib/getMediaUrl";

type Venue = { id: string; venue_name: string };
type Offer = { id: string; venue_id: string | null; image_url: string; active: boolean; sort_order: number };

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

function OfferCard({ offer, onDelete, onToggle, onDrop }: { offer: Offer; onDelete: () => void; onToggle: () => void; onDrop: (draggedId: string) => void }) {
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
      <div style={{ padding: 10, display: "flex", gap: 6, background: "#150A2E" }}>
        <button onClick={onToggle} style={{ flex: 1, padding: "6px 8px", borderRadius: 8, background: offer.active ? "rgba(46,224,110,0.15)" : "rgba(255,255,255,0.06)", border: "1px solid " + (offer.active ? "#2EE06E" : "#2E1A52"), color: offer.active ? "#2EE06E" : "#6B5A8E", fontSize: 12, cursor: "pointer" }}>{offer.active ? "Active" : "Paused"}</button>
        <button onClick={onDelete} style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(255,59,78,0.1)", border: "1px solid rgba(255,59,78,0.3)", color: "#FF7280", fontSize: 12, cursor: "pointer" }}>Delete</button>
      </div>
    </div>
  );
}

function UploadTile({ label, busy, onFile }: { label: string; busy: boolean; onFile: (file: File) => void }) {
  return (
    <label style={{ display: "inline-block", padding: "10px 16px", borderRadius: 10, background: "#150A2E", border: "1px dashed #2E1A52", color: "#D9CCF2", cursor: "pointer", fontSize: 13 }}>
      {busy ? "Uploading…" : label}
      <input type="file" accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </label>
  );
}

export default function PromoImagesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null); // venueId, "generic", or null
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const [{ data: venueData }, { data: offerData }] = await Promise.all([
      supabase.from("venues").select("id,venue_name").order("venue_name"),
      supabase.from("venue_offers").select("id,venue_id,image_url,active,sort_order").order("sort_order"),
    ]);
    setVenues((venueData || []) as Venue[]);
    setOffers((offerData || []) as Offer[]);
    setSelectedVenueId(prev => prev || (venueData || [])[0]?.id || "");
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function upload(file: File, targetVenueId: string | null) {
    setBusy(targetVenueId || "generic"); setError("");
    try {
      const ready = await prepareImage(file);
      const formData = new FormData(); formData.append("file", ready);
      const res = await fetch("/api/upload-image", { method: "POST", body: formData });
      const raw = await res.text(); let data: { url?: string; error?: { message?: string } } = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error(!res.ok ? `Upload failed (server error ${res.status})` : "Upload failed - unexpected server response"); }
      if (!res.ok || data.error || !data.url) throw new Error(data?.error?.message || "Upload failed");
      const supabase = createSupabaseBrowserClient();
      const nextOrder = offers.filter(o => o.venue_id === targetVenueId).length;
      const { data: inserted, error: insertError } = await supabase.from("venue_offers").insert({ venue_id: targetVenueId, image_url: data.url, active: true, sort_order: nextOrder }).select().single();
      if (insertError) setError(insertError.message); else setOffers(prev => [...prev, inserted as Offer]);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(null); }
  }
  async function deleteOffer(id: string) {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("venue_offers").delete().eq("id", id);
    setOffers(prev => prev.filter(o => o.id !== id));
  }
  async function toggleOffer(offer: Offer) {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("venue_offers").update({ active: !offer.active }).eq("id", offer.id);
    setOffers(prev => prev.map(o => o.id === offer.id ? { ...o, active: !o.active } : o));
  }
  async function reorder(orderedIds: string[]) {
    setOffers(prev => { const order = new Map(orderedIds.map((id, i) => [id, i])); return prev.map(o => order.has(o.id) ? { ...o, sort_order: order.get(o.id)! } : o); });
    const supabase = createSupabaseBrowserClient();
    await Promise.all(orderedIds.map((id, i) => supabase.from("venue_offers").update({ sort_order: i }).eq("id", id)));
  }
  function grid(list: Offer[], onFile: (file: File) => void, uploadKey: string, emptyText: string) {
    return (
      <>
        <UploadTile label="+ Upload image" busy={busy === uploadKey} onFile={onFile} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12, marginTop: 12 }}>
          {list.map((o, i) => (
            <OfferCard key={o.id} offer={o} onDelete={() => deleteOffer(o.id)} onToggle={() => toggleOffer(o)} onDrop={draggedId => {
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
  const previewPhotos = useMemo(() => [...venueOffers, ...genericOffers].filter(o => o.active).map(o => getMediaUrl(o.image_url) || o.image_url), [venueOffers, genericOffers]);
  const [previewIdx, setPreviewIdx] = useState(0);
  useEffect(() => {
    if (previewPhotos.length < 2) return;
    const id = window.setInterval(() => setPreviewIdx(i => (i + 1) % previewPhotos.length), 3000);
    return () => window.clearInterval(id);
  }, [previewPhotos.length]);

  if (loading) return <main style={{ minHeight: "100vh", background: "#0A0118", display: "grid", placeItems: "center", color: "#fff" }}>Loading…</main>;

  return (
    <main className="qi-bo-page">
      <header className="qi-bo-pagehead">
        <div><p>Media &amp; Music</p><h1>Promo Images</h1><span>What rotates on player handsets between rounds (not the Display screen). Drag a tile to reorder.</span></div>
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
        {venues.length === 0 ? <p style={{ color: "#FFC533", fontSize: 13 }}>Add a venue first, then come back here to upload images just for it.</p> : grid(venueOffers, f => upload(f, selectedVenueId), selectedVenueId, "No images uploaded for this venue yet.")}
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ margin: "0 0 4px" }}>Generic images (rotate at every venue)</h3>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6B5A8E" }}>Show up in the rotation everywhere, alongside whichever venue-specific images are active there.</p>
        {grid(genericOffers, f => upload(f, null), "generic", "No generic images yet.")}
      </section>

      <section>
        <h3 style={{ margin: "0 0 4px" }}>Handset preview</h3>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6B5A8E" }}>What a player&rsquo;s phone actually shows during intermission for the venue selected above (its own active images + every active generic image).</p>
        <div style={{ width: 220, aspectRatio: "1", borderRadius: 14, overflow: "hidden", border: "1.5px solid rgba(190,38,193,0.4)", position: "relative", background: "rgba(0,0,0,0.35)" }}>
          {previewPhotos.length > 0 ? (
            <img key={previewPhotos[previewIdx % previewPhotos.length]} src={previewPhotos[previewIdx % previewPhotos.length]} alt="Handset preview" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
          ) : (
            <div style={{ display: "grid", placeItems: "center", height: "100%", color: "#6B5A8E", fontSize: 12, textAlign: "center", padding: 12 }}>Nothing active to show yet</div>
          )}
          {previewPhotos.length > 1 && (
            <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 5 }}>
              {previewPhotos.map((_, i) => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: i === (previewIdx % previewPhotos.length) ? "#BE26C1" : "rgba(255,255,255,0.35)" }} />)}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
