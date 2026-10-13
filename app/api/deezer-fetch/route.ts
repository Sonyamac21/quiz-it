import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPreviewAudioUrl } from "@/lib/media/previewUrl";

export const runtime = "nodejs";

// The browser cannot fetch preview MP3s directly due to CORS.
// This route fetches them server-side and streams the bytes back,
// allowing the browser to decode the audio for the waveform editor.
// Deezer search now automatically falls back to Apple's iTunes Search API
// when Deezer's API blocks the request (see /api/deezer-search), so this
// proxy has to accept iTunes' preview CDN domains too, not just Deezer's.
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient(req, new NextResponse());
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return NextResponse.json({ error: "Sign in to prepare music." }, { status: 401 });
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });

  // Safety: only proxy known preview-audio CDN domains
  if (!isPreviewAudioUrl(url)) {
    return NextResponse.json({ error: "Not a recognised preview-audio URL" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "audio/mpeg, audio/*",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Deezer CDN returned ${res.status}` }, { status: 502 });
    }

    const contentType = res.headers.get("Content-Type")?.split(";")[0] || "audio/mpeg";
    const maxBytes = 10 * 1024 * 1024;
    if ((!contentType.startsWith("audio/") && contentType !== "application/octet-stream") || Number(res.headers.get("Content-Length")) > maxBytes || !res.body) {
      await res.body?.cancel();
      return NextResponse.json({ error: "Preview was not a supported audio file." }, { status: 502 });
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); return NextResponse.json({ error: "Preview file is too large." }, { status: 502 }); }
      chunks.push(value);
    }
    const audioBuffer = Buffer.concat(chunks);

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Content-Length": audioBuffer.byteLength.toString(),
        "Cache-Control": "no-store", // preview URLs expire, don't cache
      },
    });
  } catch (e) {
    console.error("Deezer audio proxy failed:", e);
    return NextResponse.json({ error: "The audio preview could not be loaded." }, { status: 502 });
  }
}
