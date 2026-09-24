import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Venue hero videos are short branded loops (logo/schedule reveal), not
// full-length content, so this cap is generous for that use case without
// letting someone accidentally upload a full-length recording.
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
const ACCEPTED_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export async function POST(req: NextRequest) {
  try {
    // Codex pre-launch review, finding #6: no auth check. Every real caller
    // (venues page, VideoUploader) is a logged-in host page.
    const res = new NextResponse();
    const supabase = createSupabaseServerClient(req, res);
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return NextResponse.json({ error: { message: "Not logged in - please log in again." } }, { status: 401 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: { message: "Video storage isn't configured yet - BLOB_READ_WRITE_TOKEN is missing." } },
        { status: 500 }
      );
    }

    const formData = await req.formData() as unknown as { get(name: string): FormDataEntryValue | null };
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: { message: "No file provided" } }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: { message: "Video too large - max 40MB. Keep hero videos short (under ~15s)." } }, { status: 400 });
    }
    // iPhone Camera Roll videos (HEVC-encoded .mov) frequently arrive with
    // file.type empty or "application/octet-stream" instead of
    // "video/quicktime" - see VideoUploader's matching client-side fix.
    // Blindly defaulting an unrecognized type to "video/mp4" (the previous
    // behaviour) stored the file's real .mov/HEVC bytes under an .mp4
    // extension and a video/mp4 content-type - a container/codec mismatch
    // that Safari tolerates but Chrome/Firefox/most smart TVs don't, so
    // the exact iPhone videos this was meant to support would upload fine
    // and then fail to play on the live Display. Falling back to the
    // original filename's extension (still available on the File object)
    // instead keeps the stored file's declared type honest.
    const originalName = file instanceof File ? file.name : "";
    const looksLikeMov = /\.mov$/i.test(originalName);
    const looksLikeWebm = /\.webm$/i.test(originalName);
    const contentType = ACCEPTED_TYPES.includes(file.type)
      ? file.type
      : looksLikeMov ? "video/quicktime" : looksLikeWebm ? "video/webm" : "video/mp4";
    const ext = contentType === "video/webm" ? "webm" : contentType === "video/quicktime" ? "mov" : "mp4";

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = "venue-video/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
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
    console.error("Video upload failed:", e);
    return NextResponse.json(
      { error: { message: e instanceof Error ? e.message : "Video upload failed" } },
      { status: 500 }
    );
  }
}
