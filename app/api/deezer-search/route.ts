import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "Missing q parameter" }, { status: 400 });

  try {
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=5&order=RANKING`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Deezer returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json();

    if (!data.data || data.data.length === 0) {
      return NextResponse.json({ candidates: [] });
    }

    // Return top 3, filtering out results without a preview URL
    const candidates = data.data
      .filter((t: Record<string, unknown>) => t.preview)
      .slice(0, 3)
      .map((t: Record<string, unknown>) => {
        const artist = t.artist as Record<string, unknown>;
        const album = t.album as Record<string, unknown>;
        const duration = (t.duration as number) || 0;
        return {
          id: t.id,
          title: t.title,
          artist: artist?.name || "",
          album: album?.title || "",
          duration_seconds: duration,
          duration_formatted: `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`,
          preview_url: t.preview,
          cover: album?.cover_medium || "",
        };
      });

    return NextResponse.json({ candidates });
  } catch (e) {
    console.error("Deezer search failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Search failed" }, { status: 500 });
  }
}
