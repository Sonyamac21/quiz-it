"use client";

// Builds a downloadable vertical (Reels-shaped) video from approved
// quiz-night photos entirely in the browser - no server, no video encoding
// service. Branded per the "essential" requirement: a Quiz-It + Mac
// Entertainment title card to open, the venue's own logo on the closing
// card. No music is baked in on purpose - Instagram's own editor licenses
// music at post time, and baking in a track here would mean shipping audio
// this app doesn't hold the rights to loop into every venue's export.

export type ReelPhoto = { url: string };

export type ReelOptions = {
  photos: ReelPhoto[];
  venueName: string | null;
  venueLogoUrl: string | null;
  onProgress?: (fraction: number) => void;
};

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const TITLE_SECONDS = 2.6;
const PHOTO_SECONDS = 2.4;
const CLOSING_SECONDS = 2.8;
const FADE_SECONDS = 0.5;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load " + src));
    img.src = src;
  });
}

function drawCoverImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, zoom: number) {
  const imgRatio = img.width / img.height;
  const canvasRatio = WIDTH / HEIGHT;
  let drawWidth: number, drawHeight: number;
  if (imgRatio > canvasRatio) {
    drawHeight = HEIGHT * zoom;
    drawWidth = drawHeight * imgRatio;
  } else {
    drawWidth = WIDTH * zoom;
    drawHeight = drawWidth / imgRatio;
  }
  const x = (WIDTH - drawWidth) / 2;
  const y = (HEIGHT - drawHeight) / 2;
  ctx.drawImage(img, x, y, drawWidth, drawHeight);
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const gradient = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.42, 100, WIDTH / 2, HEIGHT * 0.42, HEIGHT * 0.75);
  gradient.addColorStop(0, "#1a0836");
  gradient.addColorStop(1, "#07030f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawWordmark(ctx: CanvasRenderingContext2D, y: number, size: number) {
  ctx.textAlign = "center";
  ctx.font = `900 ${size}px 'Bruno Ace SC', sans-serif`;
  const label = "QUIZ-IT";
  const quizWidth = ctx.measureText("QUIZ-").width;
  const totalWidth = ctx.measureText(label).width;
  const startX = WIDTH / 2 - totalWidth / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = "#BE26C1";
  ctx.fillText("QUIZ-", startX, y);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("IT", startX + quizWidth, y);
  ctx.textAlign = "center";
}

async function drawTitleCard(ctx: CanvasRenderingContext2D) {
  drawBackground(ctx);
  drawWordmark(ctx, HEIGHT * 0.46, 108);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "600 34px 'Inter', sans-serif";
  ctx.fillText("QUIZ NIGHT HIGHLIGHTS", WIDTH / 2, HEIGHT * 0.52);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "500 28px 'Inter', sans-serif";
  ctx.fillText("Powered by Mac Entertainment", WIDTH / 2, HEIGHT * 0.92);
}

async function drawClosingCard(ctx: CanvasRenderingContext2D, venueName: string | null, venueLogo: HTMLImageElement | null) {
  drawBackground(ctx);
  if (venueLogo) {
    const logoSize = 220;
    const x = WIDTH / 2 - logoSize / 2;
    const y = HEIGHT * 0.32 - logoSize / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(WIDTH / 2, HEIGHT * 0.32, logoSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.strokeStyle = "#d94fdc";
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.clip();
    ctx.drawImage(venueLogo, x, y, logoSize, logoSize);
    ctx.restore();
  }
  if (venueName) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 46px 'Inter', sans-serif";
    ctx.fillText(venueName, WIDTH / 2, HEIGHT * 0.46);
  }
  drawWordmark(ctx, HEIGHT * 0.58, 72);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "600 30px 'Inter', sans-serif";
  ctx.fillText("SEE YOU NEXT QUIZ NIGHT", WIDTH / 2, HEIGHT * 0.64);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "500 26px 'Inter', sans-serif";
  ctx.fillText("Powered by Mac Entertainment", WIDTH / 2, HEIGHT * 0.92);
}

export async function buildAndDownloadReel({ photos, venueName, venueLogoUrl, onProgress }: ReelOptions): Promise<void> {
  if (typeof document === "undefined") throw new Error("Reel export only runs in the browser");
  if (!("MediaRecorder" in window)) throw new Error("This browser cannot export video. Try Chrome or Edge.");

  // Preload every asset up front - a mid-recording image load stall would
  // otherwise show up as a frozen frame in the exported video.
  const [images, venueLogo] = await Promise.all([
    Promise.all(photos.map(p => loadImage(p.url).catch(() => null))),
    venueLogoUrl ? loadImage(venueLogoUrl).catch(() => null) : Promise.resolve(null),
  ]);
  const goodImages = images.filter((img): img is HTMLImageElement => !!img);

  // A visible-but-offscreen canvas - some browsers throttle or refuse to
  // capture a stream from a canvas that was never attached to the DOM.
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.position = "fixed";
  canvas.style.left = "-99999px";
  canvas.style.top = "0";
  document.body.appendChild(canvas);
  const context2d = canvas.getContext("2d");
  if (!context2d) { document.body.removeChild(canvas); throw new Error("Canvas not supported"); }
  // Narrowed to a non-null binding for the closures below - TS can't carry
  // the `if (!ctx)` narrowing of a `const` across into a function defined
  // later in this scope, even though it can never become null again.
  const ctx: CanvasRenderingContext2D = context2d;

  const stream = canvas.captureStream(FPS);
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  const totalSeconds = TITLE_SECONDS + goodImages.length * PHOTO_SECONDS + CLOSING_SECONDS;
  const startTime = performance.now();

  const finished = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
  recorder.start();

  await new Promise<void>(resolve => {
    function frame() {
      const elapsed = (performance.now() - startTime) / 1000;
      onProgress?.(Math.min(1, elapsed / totalSeconds));

      if (elapsed < TITLE_SECONDS) {
        drawTitleCard(ctx);
      } else if (elapsed < TITLE_SECONDS + goodImages.length * PHOTO_SECONDS) {
        const into = elapsed - TITLE_SECONDS;
        const idx = Math.min(goodImages.length - 1, Math.floor(into / PHOTO_SECONDS));
        const localT = into - idx * PHOTO_SECONDS;
        drawBackground(ctx);
        // Slow Ken Burns drift so a static photo still reads as motion.
        const zoom = 1.05 + (localT / PHOTO_SECONDS) * 0.08;
        ctx.save();
        if (localT < FADE_SECONDS) ctx.globalAlpha = localT / FADE_SECONDS;
        else if (localT > PHOTO_SECONDS - FADE_SECONDS) ctx.globalAlpha = (PHOTO_SECONDS - localT) / FADE_SECONDS;
        drawCoverImage(ctx, goodImages[idx], zoom);
        ctx.restore();
      } else {
        drawClosingCard(ctx, venueName, venueLogo);
      }

      if (elapsed < totalSeconds) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });

  recorder.stop();
  await finished;
  document.body.removeChild(canvas);

  const blob = new Blob(chunks, { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (venueName ? venueName.replace(/\s+/g, "-").toLowerCase() + "-" : "") + "quiz-it-reel.webm";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
