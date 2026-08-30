import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // generous for a ~30s WAV clip

export async function POST(req: NextRequest) {
  try {
    // Codex pre-launch review, finding #6: no auth check, and no content
    // type validation - a file was labelled "audio/wav" and stored with
    // that content type regardless of what it actually was. Every real
    // caller (Music Prep, AudioUploader, AudioRecorder) is a logged-in host
    // page.
    const res = new NextResponse();
    const supabase = createSupabaseServerClient(req, res);
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return NextResponse.json({ error: { message: "Not logged in - please log in again." } }, { status: 401 });
    }

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
    // The client-side recorder/trimmer always produces a real audio Blob, so
    // this is a sanity check against a mislabelled/arbitrary upload, not a
    // deep format validation - it's still stored/served as audio/wav either
    // way (the client controls the actual encoding), but at least rejects
    // something that isn't audio at all (e.g. an uploaded script or image
    // renamed to look like a clip).
    if (file.type && !file.type.startsWith("audio/") && file.type !== "application/octet-stream") {
      return NextResponse.json({ error: { message: "Only audio files are supported" } }, { status: 400 });
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
