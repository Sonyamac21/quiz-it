// Wraps a raw media URL with our authenticated proxy route when it's a
// Vercel Blob URL (which requires auth to fetch directly, since this account
// only supports private Blob stores) - leaves any other URL (Pixabay images,
// YouTube links on older questions, anything else) completely unchanged.
export function getMediaUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  if (rawUrl.includes("blob.vercel-storage.com")) {
    return "/api/media-proxy?url=" + encodeURIComponent(rawUrl);
  }
  return rawUrl;
}
