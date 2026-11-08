import { upload } from "@vercel/blob/client";

export async function uploadVenueVideo(file: File) {
  const extension = /\.mov$/i.test(file.name) ? "mov"
    : /\.webm$/i.test(file.name) ? "webm" : "mp4";
  const contentType = { mov: "video/quicktime", webm: "video/webm", mp4: "video/mp4" }[extension];
  return upload(`venue-video/${Date.now()}.${extension}`, file, {
    access: "private",
    handleUploadUrl: "/api/upload-video",
    contentType,
    multipart: file.size > 4 * 1024 * 1024,
  });
}
