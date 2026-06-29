import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // generous for a ~30s WAV clip

export async function POST(req: NextRequest) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: { message: "Audio storage isn't configured yet - BLOB_READ_WRITE_TOKEN is missing." } },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: { message: "No file provided" } }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: { message: "Clip too large - max 15MB" } }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = "question-audio/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".wav";
    const blob = await put(fileName, buffer, {
      access: "private",
      contentType: "audio/wav",
    });

    return NextResponse.json({
      url: blob.url,
      fileName,
      fileSize: buffer.length,
    });
  } catch (e) {
    console.error("Audio upload failed:", e);
    return NextResponse.json(
      { error: { message: e instanceof Error ? e.message : "Audio upload failed" } },
      { status: 500 }
    );
  }
}
