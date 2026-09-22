const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.78;

export async function prepareParticipantPhoto(file: File): Promise<File> {
  const image = document.createElement("img");
  const sourceUrl = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This photo format could not be read. Please choose a JPG, PNG, or WEBP image."));
      image.src = sourceUrl;
    });

    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is not supported in this browser.");
    try {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    } catch {
      // Some iPad/iPhone photos (large HEIC-derived images, certain
      // orientations) load fine into an <img> but throw a DOMException from
      // canvas.drawImage - and DOMException does not extend Error, so a
      // caller's `error instanceof Error` check misses it and falls back to
      // a generic, unhelpful message. Re-thrown as a real Error with a
      // specific one.
      throw new Error("This photo couldn't be processed. Please try a different photo.");
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error("Could not prepare this photo.")), "image/jpeg", JPEG_QUALITY);
    });
    const baseName = file.name.replace(/\.[^.]+$/, "") || "quiz-photo";
    return new File([blob], baseName + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
