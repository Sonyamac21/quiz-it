"use client";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Venue = {
  day_of_week: number;
  venue_name: string;
  venue_logo_url: string | null;
};

export default function VenuesPage() {
  const [venues, setVenues] = useState<Record<number, Venue>>({});
  const [loading, setLoading] = useState(true);
  const [savingDay, setSavingDay] = useState<number | null>(null);
  const [uploadingDay, setUploadingDay] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.from("venues").select("*");
      const map: Record<number, Venue> = {};
      DAYS.forEach((_, i) => { map[i] = { day_of_week: i, venue_name: "", venue_logo_url: null }; });
      if (data) data.forEach((v: Venue) => { map[v.day_of_week] = v; });
      setVenues(map);
      setLoading(false);
    })();
  }, []);

  function updateName(day: number, name: string) {
    setVenues(prev => ({ ...prev, [day]: { ...prev[day], venue_name: name } }));
  }

  async function saveDay(day: number) {
    setSavingDay(day);
    const supabase = createSupabaseBrowserClient();
    const v = venues[day];
    await supabase.from("venues").upsert({
      day_of_week: day,
      venue_name: v.venue_name,
      venue_logo_url: v.venue_logo_url,
    }, { onConflict: "day_of_week" });
    setSavingDay(null);
  }

  async function handleLogoUpload(day: number, file: File) {
    setUploadingDay(day);
    const supabase = createSupabaseBrowserClient();
    const ext = file.name.split(".").pop() || "jpg";
    const path = "day-" + day + "-" + Date.now() + "." + ext;
    const { error: uploadError } = await supabase.storage.from("venue-logos").upload(path, file);
    if (!uploadError) {
      const { data: urlData } = supabase.storage.from("venue-logos").getPublicUrl(path);
      const url = urlData?.publicUrl || null;
      setVenues(prev => ({ ...prev, [day]: { ...prev[day], venue_logo_url: url } }));
      const supabase2 = createSupabaseBrowserClient();
      await supabase2.from("venues").upsert({
        day_of_week: day,
        venue_name: venues[day]?.venue_name || "",
        venue_logo_url: url,
      }, { onConflict: "day_of_week" });
    }
    setUploadingDay(null);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #1a0535 0%, #0d0225 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)" }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #1a0535 0%, #0d0225 100%)", color: "#fff", padding: "32px 48px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#BE26C1", letterSpacing: 4 }}>Venue Schedule</div>
          <div style={{ fontSize: 14, color: "rgba(190,38,193,0.8)" }}>Set your recurring weekly venues — the right one is picked automatically each day</div>
        </div>
        <div style={{ flex: 1 }} />
        <a href="/host/session" style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(190,38,193,0.4)", background: "rgba(190,38,193,0.06)", color: "#BE26C1", textDecoration: "none", fontSize: 14, fontWeight: 600, boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }}>Back to Session</a>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 700 }}>
        {DAYS.map((dayName, i) => {
          const v = venues[i] || { day_of_week: i, venue_name: "", venue_logo_url: null };
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderRadius: 14, background: "linear-gradient(160deg, rgba(60,15,110,0.4), rgba(30,8,60,0.4))", border: "1px solid rgba(190,38,193,0.3)", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)" }}>
              <div style={{ width: 90, fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{dayName}</div>

              {v.venue_logo_url ? (
                <img src={v.venue_logo_url} alt="" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: "1.5px solid #BE26C1" }} />
              ) : (
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1.5px dashed rgba(190,38,193,0.4)" }} />
              )}

              <label style={{ padding: "6px 12px", borderRadius: 10, background: "rgba(190,38,193,0.15)", border: "1px solid rgba(190,38,193,0.4)", color: "#BE26C1", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
                {uploadingDay === i ? "..." : "Logo"}
                <input type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(i, f); }} />
              </label>

              <input
                value={v.venue_name}
                onChange={e => updateName(i, e.target.value)}
                placeholder="Venue name..."
                style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(190,38,193,0.3)", fontSize: 14 }}
              />

              <button onClick={() => saveDay(i)} disabled={savingDay === i} style={{ padding: "8px 16px", borderRadius: 10, background: "rgba(190,38,193,0.3)", border: "1px solid #BE26C1", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0, boxShadow: savingDay === i ? "none" : "0 2px 6px rgba(0,0,0,0.2)" }}>
                {savingDay === i ? "Saving..." : "Save"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
