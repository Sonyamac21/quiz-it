import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB raw upload ceiling
const MAX_DIMENSION = 1600; // longest edge, px - plenty for a TV display, keeps file size sane

export async function POST(req: NextRequest) {
  try {
    // Codex pre-launch review, finding #6: this route had no auth check at
    // all - anyone who found the URL could write into the paid Vercel Blob
    // store. Every real caller (venues page, ImageUploader, Pixabay persist
    // for question images) is a logged-in host page; the player-facing
    // photo upload goes straight to Supabase Storage, never through this
    // route - so requiring a host session here doesn't break anything that
    // currently works.
    const res = new NextResponse();
    const supabase = createSupabaseServerClient(req, res);
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return NextResponse.json({ error: { message: "Not logged in - please log in again." } }, { status: 401 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: { message: "Image storage isn't configured yet - BLOB_READ_WRITE_TOKEN is missing. Create a Vercel Blob store for this project and redeploy." } },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: { message: "No file provided" } }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: { message: "File too large - max 10MB" } }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: { message: "Only image files are supported (JPG, PNG, WEBP)" } }, { status: 400 });
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());

    // Optimize: resize to a sane max dimension and convert to WEBP for
    // consistent, fast, reliable loading on the TV display during a live show -
    // no more depending on whatever format/size the original upload happened to be.
    // sharp is loaded dynamically (not statically imported) and wrapped in its own
    // try/catch: if its native binary isn't available on this runtime, the whole
    // route would otherwise crash at import time, on every single request. Instead
    // we fall back to storing the original, unprocessed file so uploads keep working.
    let safeBuffer: Buffer;
    let contentType = file.type || "application/octet-stream";
    let ext = "webp";

    try {
      const sharp = (await import("sharp")).default;
      const optimized = await sharp(inputBuffer)
        .rotate() // respects EXIF orientation from phone cameras
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

      // Force a fresh, non-pooled buffer copy - sharp's output can be a view into
      // Node's internal buffer pool, which @vercel/blob's put() explicitly rejects
      // with "ArrayBuffer: SharedArrayBuffer is not allowed." Buffer.from(buffer)
      // always copies into new, dedicated memory, which sidesteps this entirely.
      safeBuffer = Buffer.from(optimized);
      contentType = "image/webp";
      ext = "webp";
    } catch (sharpError) {
      console.error("sharp processing unavailable, storing original file instead:", sharpError);
      safeBuffer = inputBuffer;
      const typeExt = (file.type || "").split("/")[1];
      ext = typeExt && /^[a-z0-9]+$/i.test(typeExt) ? typeExt : "jpg";
    }

    const fileName = "question-images/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
    const blob = await put(fileName, safeBuffer, {
      access: "private",
      contentType,
    });

    return NextResponse.json({
      url: blob.url,
      fileName,
      fileSize: safeBuffer.length,
    });
  } catch (e) {
    console.error("Image upload failed:", e);
    return NextResponse.json(
      { error: { message: e instanceof Error ? e.message : "Image upload failed" } },
      { status: 500 }
    );
  }
}
