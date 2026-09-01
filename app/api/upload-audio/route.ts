import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Victory songs are full tracks (unlike the short venue hero video clips),
// so this is a bigger cap - still well under Vercel's request body limit.
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ACCEPTED_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a"];

export async function POST(req: NextRequest) {
  try {
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
      return NextResponse.json({ error: { message: "Audio file too large - max 15MB." } }, { status: 400 });
    }
    const contentType = ACCEPTED_TYPES.includes(file.type) ? file.type : "audio/mpeg";
    const ext = contentType.includes("wav") ? "wav" : contentType.includes("m4a") || contentType.includes("mp4") ? "m4a" : "mp3";

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = "victory-song/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
    const blob = await put(fileName, buffer, {
      access: "private",
      contentType,
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
