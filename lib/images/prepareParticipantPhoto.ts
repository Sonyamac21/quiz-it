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
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error("Could not prepare this photo.")), "image/jpeg", JPEG_QUALITY);
    });
    const baseName = file.name.replace(/\.[^.]+$/, "") || "quiz-photo";
    return new File([blob], baseName + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
