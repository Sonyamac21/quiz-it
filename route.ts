import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";

export const runtime = "nodejs";

// Vercel Blob on this account only supports private stores (no public-access
// option exists in the dashboard for new stores). Private blobs require
// authentication to fetch - a plain <img src="..."> or <audio src="..."> tag
// can't attach our secret token, so it would just get a 401/403. This route
// is the fix: our server (which holds BLOB_READ_WRITE_TOKEN) fetches the blob
// authenticated, then streams the bytes back to the browser as a normal,
// unauthenticated response. The browser never needs to know the blob is private.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: { message: "Missing url parameter" } }, { status: 400 });
  }
  // Basic safety check - only proxy actual Vercel Blob URLs, never act as an
  // open proxy for arbitrary URLs.
  if (!url.includes("blob.vercel-storage.com")) {
    return NextResponse.json({ error: { message: "Not a recognized media URL" } }, { status: 400 });
  }

  try {
    const result = await get(url, { access: "private" });
    if (!result) {
      return NextResponse.json({ error: { message: "Media not found" } }, { status: 404 });
    }
    return new NextResponse(result.stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": result.blob.contentType || "application/octet-stream",
        // These are immutable, randomly-named uploaded assets - safe to cache
        // aggressively for instant repeat loads during a live show.
        "Cache-Control": "public, max-age=2592000, immutable",
      },
    });
  } catch (e) {
    console.error("Media proxy failed:", e);
    return NextResponse.json({ error: { message: e instanceof Error ? e.message : "Media proxy failed" } }, { status: 500 });
  }
}
