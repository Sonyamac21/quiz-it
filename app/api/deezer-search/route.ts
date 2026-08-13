import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Deezer's public search API blocks plenty of datacenter/serverless IP
// ranges (Vercel included) with a flat 403 - it's built for their own
// client apps, not server-to-server calls, and this happens consistently
// in production even though it can work fine from a residential IP when
// testing locally. A convincing browser User-Agent fixes it for some IPs
// but not reliably all of them, so this route now tries Deezer first (it's
// still the best match quality when it works) and, if that fails for any
// reason, automatically falls back to Apple's iTunes Search API - no key
// required, very reliable from server IPs, and also returns a 30-second
// preview MP3 URL in the same shape the rest of Music Prep already expects.
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
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=5&order=RANKING`;
    const res = await fetch(url, {
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
      .slice(0, 3)
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
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=5`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = await res.json();
    const results = (data.results || []) as Record<string, unknown>[];
    return results
      .filter(t => t.previewUrl)
      .slice(0, 3)
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
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "Missing q parameter" }, { status: 400 });

  const deezerResult = await searchDeezer(q);
  if (deezerResult && deezerResult.length > 0) {
    return NextResponse.json({ candidates: deezerResult, source: "deezer" });
  }

  const itunesResult = await searchItunes(q);
  if (itunesResult && itunesResult.length > 0) {
    return NextResponse.json({ candidates: itunesResult, source: "itunes" });
  }

  // Both providers came back empty/failing - deezerResult === null means
  // Deezer itself errored (e.g. the 403), so say so explicitly rather than
  // just reporting "no results", which was misleading before.
  if (deezerResult === null && itunesResult === null) {
    return NextResponse.json({ error: "Deezer and iTunes search both failed - check server connectivity" }, { status: 502 });
  }
  return NextResponse.json({ candidates: [] });
}
