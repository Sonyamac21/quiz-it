import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMediaUrl } from "@/lib/getMediaUrl";

export type VenueOffer = {
  id: string;
  venue_id: string | null;
  image_url: string;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
};

// Returns the resolved, proxy-safe image URLs that should currently rotate
// for this venue: the venue's own offers plus any generic (venue_id = null)
// offers that run at every venue, filtered to active + today's date range,
// in a stable order. Used by both the display screen and player handsets
// during intermission.
export async function fetchActiveVenueOffers(venueId: string | null): Promise<string[]> {
  const supabase = createSupabaseBrowserClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("venue_offers")
    .select("id,venue_id,image_url,active,start_date,end_date,sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return (data as VenueOffer[])
    .filter(row => row.venue_id === venueId || row.venue_id === null)
    .filter(row => !row.start_date || row.start_date <= today)
    .filter(row => !row.end_date || row.end_date >= today)
    .map(row => getMediaUrl(row.image_url) || row.image_url);
}
