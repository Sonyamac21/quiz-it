"use client";
// TEMPORARY diagnostic page - not linked anywhere. Calls the exact same
// query fetchActiveVenueOffers() uses, but prints the raw Supabase
// response (data + error) so we can see why the handset intermission
// carousel is coming back empty. Safe to delete once the venue_offers
// bug is found - has no dependency on any session/game state.
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function OffersDebugPage() {
  const [result, setResult] = useState<string>("Loading...");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase
      .from("venue_offers")
      .select("id,venue_id,image_url,active,start_date,end_date,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        setResult(JSON.stringify({ error: error ? { message: error.message, code: error.code, details: error.details, hint: error.hint } : null, rowCount: data?.length ?? 0, data }, null, 2));
      });
  }, []);

  return (
    <div style={{ background: "#0A0118", color: "#fff", minHeight: "100vh", padding: 24, fontFamily: "monospace", fontSize: 13, whiteSpace: "pre-wrap" }}>
      <h1 style={{ fontSize: 16 }}>venue_offers raw query result</h1>
      {result}
    </div>
  );
}
