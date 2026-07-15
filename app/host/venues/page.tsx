"use client";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { HostShell, HostButton, HostInput, HostLoading, TopSpacer } from "@/components/fable/HostConsole";

const STAGE_BG = "radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118";
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
      <HostShell>
        <div style={{ minHeight: "100vh", background: STAGE_BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <HostLoading title="Venue Management" note="Loading your weekly schedule…" />
        </div>
      </HostShell>
    );
  }

  return (
    <HostShell>
      <div style={{ minHeight: "100vh", background: STAGE_BG, color: "#fff", padding: "24px 32px" }}>
        {/* TOP BAR */}
        <div className="fbh-top" style={{ border: "1px solid #2E1A52", borderRadius: 16, marginBottom: 24 }}>
          <span className="fbh-wm" style={{ fontSize: 16 }}><span className="q">QUIZ-</span>IT</span>
          <span className="fbh-bc">Venue Management</span>
          <TopSpacer />
          <a className="fbh-btn" href="/host/session">Back to Session</a>
        </div>

        <div style={{ font: "400 12.5px 'Inter'", color: "#B9A8D9", marginBottom: 16, maxWidth: 640 }}>
          Set your recurring weekly venues — the right one is picked automatically each day.
        </div>

        {/* DAY ROWS */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
          {DAYS.map((dayName, i) => {
            const v = venues[i] || { day_of_week: i, venue_name: "", venue_logo_url: null };
            return (
              <div key={i} className="fbh-panel" style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 0 }}>
                <div style={{ width: 90, font: "600 12.5px 'Inter'", color: "#B9A8D9", letterSpacing: "0.04em" }}>{dayName}</div>

                {v.venue_logo_url ? (
                  <img src={v.venue_logo_url} alt="" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: "1.5px solid #BE26C1" }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#150A2E", border: "1.5px dashed #8A1B8D", flexShrink: 0 }} />
                )}

                <label className="fbh-btn" style={{ height: 36, cursor: "pointer", flexShrink: 0 }}>
                  {uploadingDay === i ? "…" : "Logo"}
                  <input type="file" accept="image/*" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(i, f); }} />
                </label>

                <HostInput
                  value={v.venue_name}
                  onChange={e => updateName(i, e.target.value)}
                  placeholder="Venue name…"
                  style={{ flex: 1 }}
                />

                <HostButton variant="pri" onClick={() => saveDay(i)} disabled={savingDay === i} style={{ height: 36, flexShrink: 0 }}>
                  {savingDay === i ? "SAVING…" : "SAVE"}
                </HostButton>
              </div>
            );
          })}
        </div>
      </div>
    </HostShell>
  );
}
