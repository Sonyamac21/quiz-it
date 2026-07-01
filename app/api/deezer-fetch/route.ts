import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// The browser cannot fetch Deezer preview MP3s directly due to CORS.
// This route fetches them server-side and streams the bytes back,
// allowing the browser to decode the audio for the waveform editor.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });

  // Safety: only proxy Deezer CDN URLs
  if (!url.includes("dzcdn.net") && !url.includes("deezer.com")) {
    return NextResponse.json({ error: "Not a Deezer URL" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "audio/mpeg, audio/*",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Deezer CDN returned ${res.status}` }, { status: 502 });
    }

    const audioBuffer = await res.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "Cache-Control": "no-store", // preview URLs expire, don't cache
      },
    });
  } catch (e) {
    console.error("Deezer audio proxy failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fetch failed" }, { status: 500 });
  }
}
