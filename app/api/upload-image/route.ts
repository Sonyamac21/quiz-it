import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import sharp from "sharp";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB raw upload ceiling
const MAX_DIMENSION = 1600; // longest edge, px - plenty for a TV display, keeps file size sane

export async function POST(req: NextRequest) {
  try {
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
    const optimized = await sharp(inputBuffer)
      .rotate() // respects EXIF orientation from phone cameras
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const fileName = "question-images/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".webp";
    const blob = await put(fileName, optimized, {
      access: "public",
      contentType: "image/webp",
    });

    return NextResponse.json({
      url: blob.url,
      fileName,
      fileSize: optimized.length,
    });
  } catch (e) {
    console.error("Image upload failed:", e);
    return NextResponse.json(
      { error: { message: e instanceof Error ? e.message : "Image upload failed" } },
      { status: 500 }
    );
  }
}
