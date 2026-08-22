// Pixabay's webformatURL/largeImageURL are convenient to hotlink at generation
// time, but they are NOT a permanent address - Pixabay's own terms ask
// integrators not to rely on long-term hotlinking, and in practice these URLs
// do go dead after enough time passes (an image gets pulled, the CDN path
// rotates, etc). A picture question generated tonight could show a broken
// image months later with zero warning.
//
// To make picture-question images actually durable, we re-host the Pixabay
// photo in our own Vercel Blob storage the moment it's chosen, exactly like
// every other image in the app (venue logos, offers, gallery photos...).
// This runs client-side (same as the rest of the generation pipeline), so it
// fetches the Pixabay image as a blob and re-uploads it through the existing
// /api/upload-image route rather than talking to Vercel Blob directly.
//
// If anything here fails (CORS, network, Pixabay flakiness) we fall back to
// the original Pixabay URL rather than losing the question entirely - a
// question with a hotlinked image today is still better than no question.
export async function persistPixabayImage(pixabayUrl: string): Promise<string> {
  try {
    const imgRes = await fetch(pixabayUrl);
    if (!imgRes.ok) return pixabayUrl;
    const blob = await imgRes.blob();
    const file = new File([blob], "pixabay-" + Date.now() + ".jpg", { type: blob.type || "image/jpeg" });
    const formData = new FormData();
    formData.append("file", file);
    const uploadRes = await fetch("/api/upload-image", { method: "POST", body: formData });
    if (!uploadRes.ok) return pixabayUrl;
    const data = await uploadRes.json();
    return data?.url || pixabayUrl;
  } catch {
    return pixabayUrl;
  }
}
