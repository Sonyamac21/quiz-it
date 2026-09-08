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
//
// That fallback used to be silent - the caller got back a URL either way,
// with no way to tell "durably re-hosted" from "still a transient Pixabay
// hotlink that WILL go dead eventually" apart from string-matching the URL
// itself. A host reported picture questions rendering a broken image icon
// weeks/months after generation - exactly the failure mode this comment
// above already predicted - traced to rows whose option_b was still a raw
// Pixabay URL because the re-host silently failed at generation time and
// nothing downstream ever knew. `persisted: false` lets the caller flag
// those questions for review instead of losing that information entirely.
export async function persistPixabayImage(pixabayUrl: string): Promise<{ url: string; persisted: boolean }> {
  try {
    const imgRes = await fetch(pixabayUrl);
    if (!imgRes.ok) return { url: pixabayUrl, persisted: false };
    const blob = await imgRes.blob();
    const file = new File([blob], "pixabay-" + Date.now() + ".jpg", { type: blob.type || "image/jpeg" });
    const formData = new FormData();
    formData.append("file", file);
    const uploadRes = await fetch("/api/upload-image", { method: "POST", body: formData });
    if (!uploadRes.ok) return { url: pixabayUrl, persisted: false };
    const data = await uploadRes.json();
    return data?.url ? { url: data.url, persisted: true } : { url: pixabayUrl, persisted: false };
  } catch {
    return { url: pixabayUrl, persisted: false };
  }
}
