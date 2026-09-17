"use client";
// TEMPORARY diagnostic page - not linked anywhere. Calls the exact same
// query fetchActiveVenueOffers() uses, prints the raw Supabase response,
// then actually tries loading the first image both directly and through
// /api/media-proxy so we can see exactly where the handset intermission
// carousel is failing. Safe to delete once the venue_offers bug is found -
// has no dependency on any session/game state.
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMediaUrl } from "@/lib/getMediaUrl";

type Row = { id: string; venue_id: string | null; image_url: string; active: boolean; start_date: string | null; end_date: string | null; sort_order: number };

export default function OffersDebugPage() {
  const [result, setResult] = useState<string>("Loading...");
  const [rows, setRows] = useState<Row[]>([]);
  const [proxyStatus, setProxyStatus] = useState<string>("Not tested yet");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase
      .from("venue_offers")
      .select("id,venue_id,image_url,active,start_date,end_date,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        setResult(JSON.stringify({ error: error ? { message: error.message, code: error.code, details: error.details, hint: error.hint } : null, rowCount: data?.length ?? 0, data }, null, 2));
        setRows((data as Row[]) || []);
        const first = (data as Row[] | null)?.[0];
        if (first) {
          const proxied = getMediaUrl(first.image_url);
          fetch(proxied || first.image_url)
            .then(res => setProxyStatus(`HTTP ${res.status} ${res.statusText} | content-type: ${res.headers.get("content-type")} | url: ${proxied}`))
            .catch(e => setProxyStatus(`fetch() threw: ${e instanceof Error ? e.message : String(e)} | url: ${proxied}`));
        }
      });
  }, []);

  return (
    <div style={{ background: "#0A0118", color: "#fff", minHeight: "100vh", padding: 24, fontFamily: "monospace", fontSize: 13 }}>
      <h1 style={{ fontSize: 16 }}>venue_offers raw query result</h1>
      <pre style={{ whiteSpace: "pre-wrap" }}>{result}</pre>

      <h1 style={{ fontSize: 16 }}>fetch() test of proxy URL for row 1</h1>
      <pre style={{ whiteSpace: "pre-wrap" }}>{proxyStatus}</pre>

      <h1 style={{ fontSize: 16 }}>Actual &lt;img&gt; render test (via getMediaUrl proxy)</h1>
      {rows.map(row => (
        <div key={row.id} style={{ marginBottom: 20, borderBottom: "1px solid #333", paddingBottom: 16 }}>
          <div>id: {row.id} | venue_id: {row.venue_id ?? "null (generic)"}</div>
          <div>src: {getMediaUrl(row.image_url)}</div>
          <img
            src={getMediaUrl(row.image_url) || row.image_url}
            alt=""
            style={{ width: 160, height: 160, objectFit: "cover", border: "2px solid lime", marginTop: 6 }}
            onLoad={() => console.log("LOADED OK:", row.id)}
            onError={() => console.log("FAILED TO LOAD:", row.id)}
          />
        </div>
      ))}
    </div>
  );
}
