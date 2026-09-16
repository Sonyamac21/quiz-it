"use client";
// Preview a venue's live Display graphics without starting a real session -
// no PIN, no team join, no session row, nothing to "close" afterward. Read-
// only: fetches the venue row directly and feeds VenueShowreelPreview,
// which mirrors the live Display's pre-show reel exactly.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { VenueShowreelPreview, type PreviewVenue } from "@/components/VenueShowreelPreview";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function VenueGraphicsPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const venueId = params?.venueId as string;
  const [venue, setVenue] = useState<PreviewVenue | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!venueId) return;
    const supabase = createSupabaseBrowserClient();
    supabase
      .from("venues")
      .select("venue_name,hero_image_url,hero_video_url,venue_logo_url,prize_information,food_offers,drink_offers,happy_hour,default_quiz_day,default_start_time,default_host_name,host_photo_url,social_links")
      .eq("id", venueId)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (fetchError || !data) {
          setError(fetchError?.message || "Venue not found.");
          return;
        }
        const scheduleText = data.default_quiz_day != null
          ? `${DAYS[data.default_quiz_day]} · ${(data.default_start_time as string || "").slice(0, 5) || "Time TBC"}`
          : null;
        const offersParts = [data.food_offers, data.drink_offers, data.happy_hour].filter((v): v is string => !!v && v.trim().length > 0);
        const socialLinks = (data.social_links as Record<string, string> | null) || {};
        const instagramRaw = Object.entries(socialLinks).find(([key, value]) => key.toLowerCase().includes("instagram") && value)?.[1] || "";
        const instagramTag = instagramRaw
          ? "@" + instagramRaw.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "")
          : "";
        setVenue({
          venue_name: data.venue_name || "",
          hero_image_url: data.hero_image_url || null,
          hero_video_url: data.hero_video_url || null,
          venue_logo_url: data.venue_logo_url || null,
          prize_information: data.prize_information || null,
          intermission_offers: offersParts.join("\n"),
          schedule_text: scheduleText,
          host_name: data.default_host_name || null,
          host_photo_url: data.host_photo_url || null,
          instagram_tag: instagramTag,
        });
      });
  }, [venueId]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0A0118" }}>
      <button
        onClick={() => router.push("/host/venues")}
        style={{ position: "fixed", top: 16, left: 16, zIndex: 500, padding: "8px 16px", borderRadius: 10, background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
      >
        ← Back to Venues
      </button>
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 500, padding: "6px 14px", borderRadius: 999, background: "rgba(190,38,193,0.18)", border: "1px solid rgba(217,79,220,0.4)", color: "#D94FDC", fontSize: 12, fontWeight: 700 }}>
        PREVIEW - no live session
      </div>
      {error && <div style={{ color: "#FF7280", padding: 40, fontSize: 16 }}>{error}</div>}
      {venue && <VenueShowreelPreview venue={venue} />}
    </div>
  );
}
