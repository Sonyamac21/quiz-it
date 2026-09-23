import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMediaUrl } from "@/lib/getMediaUrl";

export type OfferSurface = "handset" | "display" | "both";

export type VenueOffer = {
  id: string;
  venue_id: string | null;
  image_url: string;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
  surface: OfferSurface;
};

// Returns the resolved, proxy-safe image URLs that should currently rotate
// for this venue on the given surface: that venue's own offers targeting
// this surface, plus any generic (venue_id = null) offers that target it,
// filtered to active + today's date range, in a stable order. Each row's
// `surface` column decides whether it shows on the handset, the Display
// screen, or both - the host wants these managed as two genuinely separate
// pools, not one shared rotation.
export async function fetchActiveVenueOffers(venueId: string | null, includeAllVenues = false, surface: OfferSurface = "handset"): Promise<string[]> {
  const supabase = createSupabaseBrowserClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("venue_offers")
    .select("id,venue_id,image_url,active,start_date,end_date,sort_order,surface")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return (data as VenueOffer[])
    .filter(row => includeAllVenues || row.venue_id === venueId || row.venue_id === null)
    .filter(row => row.surface === surface || row.surface === "both")
    .filter(row => !row.start_date || row.start_date <= today)
    .filter(row => !row.end_date || row.end_date >= today)
    // A row with no image actually attached (image_url blank/whitespace)
    // has nothing to show - previously it still rotated in, landing on
    // handsets as a broken-image icon for its turn. Only rotate slides that
    // genuinely have an uploaded image for this venue.
    .filter(row => !!row.image_url && row.image_url.trim().length > 0)
    .map(row => getMediaUrl(row.image_url) || row.image_url);
}

// Turns whatever a host pasted into "WhatsApp Group Invite Link" into a URL
// that actually opens WhatsApp - used both for the Display screen's QR code
// (scanned by a guest's phone) and the handset's own tap-to-join button.
// Hosts are expected to paste a real chat.whatsapp.com/… group invite link
// (WhatsApp's own "Invite via Link" share sheet), so any http(s) link is
// passed through unchanged. A bare phone number is also accepted as a
// fallback (some hosts may paste a number instead of a link) and turned into
// a wa.me deep link, which opens a direct chat rather than a group.
export function normalizeWhatsappLink(raw: string | null | undefined): string | null {
  const value = (raw || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}
