import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rankMusicResults } from "@/lib/media/musicSearch";

export const runtime = "nodejs";

// Search both catalogues: a nonempty list of covers from one provider must
// not prevent finding the original recording on the other. Either may fail
// independently; both return the preview shape used by Music Prep.
type Candidate = {
  id: string | number;
  title: string;
  artist: string;
  album: string;
  duration_seconds: number;
  duration_formatted: string;
  preview_url: string;
  cover: string;
};

async function searchDeezer(q: string): Promise<Candidate[] | null> {
  try {
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=25&order=RANKING`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "Accept": "application/json",
        // A bare server-side request with no User-Agent/Referer is what
        // most often gets flagged and 403'd - mimic an ordinary browser.
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Referer": "https://www.deezer.com/",
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.data || data.data.length === 0) return [];
    return data.data
      .filter((t: Record<string, unknown>) => t.preview)
      .map((t: Record<string, unknown>) => {
        const artist = t.artist as Record<string, unknown>;
        const album = t.album as Record<string, unknown>;
        const duration = (t.duration as number) || 0;
        return {
          id: t.id as string | number,
          title: t.title as string,
          artist: (artist?.name as string) || "",
          album: (album?.title as string) || "",
          duration_seconds: duration,
          duration_formatted: `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`,
          preview_url: t.preview as string,
          cover: (album?.cover_medium as string) || "",
        };
      });
  } catch {
    return null;
  }
}

async function searchItunes(q: string): Promise<Candidate[] | null> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q.replace(/\s+[-–—]\s+/g, " "))}&media=music&entity=song&limit=25`;
    const res = await fetch(url, { next: { revalidate: 0 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const results = (data.results || []) as Record<string, unknown>[];
    return results
      .filter(t => t.previewUrl)
      .map(t => {
        const durationMs = (t.trackTimeMillis as number) || 0;
        const durationSeconds = Math.round(durationMs / 1000);
        return {
          id: t.trackId as number,
          title: (t.trackName as string) || "",
          artist: (t.artistName as string) || "",
          album: (t.collectionName as string) || "",
          duration_seconds: durationSeconds,
          duration_formatted: `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, "0")}`,
          preview_url: t.previewUrl as string,
          cover: (t.artworkUrl100 as string) || "",
        };
      });
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient(req, new NextResponse());
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) return NextResponse.json({ error: "Sign in to search music." }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "Missing q parameter" }, { status: 400 });

  const [deezerResult, itunesResult] = await Promise.all([searchDeezer(q), searchItunes(q)]);
  const candidates = rankMusicResults(q, [...(deezerResult || []), ...(itunesResult || [])]).slice(0, 20);
  if (candidates.length) return NextResponse.json({ candidates, source: "deezer-and-itunes" });

  // Both providers came back empty/failing - deezerResult === null means
  // Deezer itself errored (e.g. the 403), so say so explicitly rather than
  // just reporting "no results", which was misleading before.
  if (deezerResult === null && itunesResult === null) {
    return NextResponse.json({ error: "Deezer and iTunes search both failed - check server connectivity" }, { status: 502 });
  }
  return NextResponse.json({ candidates: [] });
}
