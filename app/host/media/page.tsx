"use client";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMediaUrl } from "@/lib/getMediaUrl";
import { useConfirmDialog } from "@/components/ui/quiz-it-ui";

type Venue = { id: string; venue_name: string; venue_logo_url: string | null; hero_image_url: string | null; gallery_images: string[]; display_slides: string[]; display_adverts: string[] };
type AssetType = "Logo" | "Hero" | "Gallery" | "Slide" | "Advert";
type Asset = { url: string; type: AssetType; venue: string; venueId: string };

// Which venues column each asset type lives in, and whether it's a single
// field (cleared to null) or an array field (the one matching url removed).
const SINGLE_FIELD: Record<string, keyof Venue> = { Logo: "venue_logo_url", Hero: "hero_image_url" };
const ARRAY_FIELD: Record<string, keyof Venue> = { Gallery: "gallery_images", Slide: "display_slides", Advert: "display_adverts" };

export default function MediaLibrary() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [search, setSearch] = useState("");
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirmDialog();

  const load = useCallback(async () => {
    const { data } = await createSupabaseBrowserClient().from("venues").select("id,venue_name,venue_logo_url,hero_image_url,gallery_images,display_slides,display_adverts");
    setVenues((data || []) as Venue[]);
  }, []);
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t); }, [load]);

  const assets = useMemo(() => venues.flatMap(v => [
    { url: v.venue_logo_url, type: "Logo" as AssetType },
    { url: v.hero_image_url, type: "Hero" as AssetType },
    ...(v.gallery_images || []).map(url => ({ url, type: "Gallery" as AssetType })),
    ...(v.display_slides || []).map(url => ({ url, type: "Slide" as AssetType })),
    ...(v.display_adverts || []).map(url => ({ url, type: "Advert" as AssetType })),
  ].filter(a => a.url).map(a => ({ ...a, url: a.url as string, venue: v.venue_name, venueId: v.id })))
    .filter(a => `${a.venue} ${a.type}`.toLowerCase().includes(search.toLowerCase())), [venues, search]);

  async function deleteAsset(asset: Asset) {
    if (!(await confirmDialog(`Delete this ${asset.type} image from ${asset.venue}? This can't be undone.`, { tone: "destructive", confirmLabel: "Delete" }))) return;
    const key = `${asset.venueId}-${asset.type}-${asset.url}`;
    setDeleting(key);
    const supabase = createSupabaseBrowserClient();
    const venue = venues.find(v => v.id === asset.venueId);
    if (!venue) { setDeleting(null); return; }
    let payload: Partial<Venue>;
    if (SINGLE_FIELD[asset.type]) {
      payload = { [SINGLE_FIELD[asset.type]]: null } as Partial<Venue>;
    } else {
      const field = ARRAY_FIELD[asset.type];
      const current = (venue[field] as string[]) || [];
      payload = { [field]: current.filter(u => u !== asset.url) } as Partial<Venue>;
    }
    const { error } = await supabase.from("venues").update(payload).eq("id", asset.venueId);
    if (!error) setVenues(prev => prev.map(v => v.id === asset.venueId ? { ...v, ...payload } : v));
    setDeleting(null);
  }

  return (
    <main className="qi-bo-page">
      {confirmDialogEl}
      <header className="qi-bo-pagehead">
        <div><p>Assets</p><h1>Media Library</h1><span>{assets.length} asset{assets.length === 1 ? "" : "s"} across {venues.length} venue{venues.length === 1 ? "" : "s"} · click an image to open it full size, or use Delete to remove it.</span></div>
      </header>
      <input className="qi-bo-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search venue or media type" aria-label="Search media" />
      <div className="qi-bo-media" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
        {assets.map((asset, index) => {
          const key = `${asset.venueId}-${asset.type}-${asset.url}-${index}`;
          const deleteKey = `${asset.venueId}-${asset.type}-${asset.url}`;
          const resolved = getMediaUrl(asset.url) || asset.url;
          return (
            <article key={key} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden", background: "rgba(255,255,255,0.03)" }}>
              <div style={{ position: "relative", width: "100%", height: 150, background: "rgba(0,0,0,0.3)" }}>
                {failed[key] ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 12, textAlign: "center", color: "#FF7280", font: "600 12px 'Inter'" }}>Image failed to load</div>
                ) : (
                  <a href={resolved} target="_blank" rel="noopener noreferrer" style={{ position: "absolute", inset: 0, display: "block" }}>
                    <Image unoptimized fill sizes="280px" style={{ objectFit: "cover" }} src={resolved} alt={`${asset.venue} ${asset.type}`} onError={() => setFailed(f => ({ ...f, [key]: true }))} />
                  </a>
                )}
              </div>
              <div style={{ padding: "8px 10px 10px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ display: "block", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.venue}</strong>
                  <span style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{asset.type}</span>
                </div>
                <button
                  onClick={() => deleteAsset(asset)}
                  disabled={deleting === deleteKey}
                  style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 8, background: "rgba(255,59,78,0.1)", border: "1px solid rgba(255,59,78,0.3)", color: "#FF7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                >
                  {deleting === deleteKey ? "…" : "Delete"}
                </button>
              </div>
            </article>
          );
        })}
        {!assets.length && <div className="qi-bo-empty"><strong>No media found</strong><span>Upload venue media from Venue Manager.</span></div>}
      </div>
    </main>
  );
}
