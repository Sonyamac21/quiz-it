import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Lets a host search Pixabay directly and pick a specific photo for a
// picture question, instead of only being able to regenerate (which picks
// a random AI-chosen search query and photo) or paste a raw image URL by
// hand. Mirrors the pattern of /api/deezer-search for Music Prep.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "Missing q parameter" }, { status: 400 });

  const pixabayKey = process.env.NEXT_PUBLIC_PIXABAY_API_KEY;
  if (!pixabayKey) return NextResponse.json({ error: "Pixabay API key not configured" }, { status: 500 });

  try {
    const url = "https://pixabay.com/api/?key=" + pixabayKey +
      "&q=" + encodeURIComponent(q) +
      "&image_type=photo&per_page=12&safesearch=true";
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) {
      return NextResponse.json({ error: `Pixabay returned ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    const candidates = (data.hits || []).slice(0, 9).map((hit: Record<string, unknown>) => ({
      id: hit.id,
      thumb: hit.previewURL,
      full: hit.webformatURL || hit.largeImageURL,
      tags: hit.tags,
    }));
    return NextResponse.json({ candidates });
  } catch (e) {
    console.error("Pixabay search failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Search failed" }, { status: 500 });
  }
}
