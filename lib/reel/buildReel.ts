"use client";

import { getMediaUrl } from "@/lib/getMediaUrl";

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

// A handful of on-brand "looks" - picking one at random per render (plus a
// random photo shuffle and zoom direction below) is what stops every reel
// for the same venue coming out identical.
type ReelVariant = {
  name: string;
  accent: string;
  tint: string;
  tintOpacity: number;
  capcutTip: string;
};

const REEL_VARIANTS: ReelVariant[] = [
  { name: "Classic Purple", accent: "#BE26C1", tint: "#BE26C1", tintOpacity: 0, capcutTip: "Add a trending audio track and a bold text caption with the winning team's name." },
  { name: "Warm Glow", accent: "#FF8A3D", tint: "#FF8A3D", tintOpacity: 0.08, capcutTip: "Try CapCut's \"Golden Hour\" filter and a slow zoom transition between clips." },
  { name: "Cool Blue", accent: "#38BDF8", tint: "#38BDF8", tintOpacity: 0.08, capcutTip: "Try CapCut's \"Moonlight\" filter with a beat-synced cut effect on a trending sound." },
  { name: "Vintage Film", accent: "#D9A441", tint: "#8B5E2B", tintOpacity: 0.12, capcutTip: "Add CapCut's film grain overlay and a light vignette for a nostalgic look." },
  { name: "High Contrast", accent: "#FF3B6E", tint: "#FF3B6E", tintOpacity: 0.06, capcutTip: "Bump contrast and saturation a little in CapCut, then add punchy animated captions." },
];

function pickVariant(): ReelVariant {
  return REEL_VARIANTS[Math.floor(Math.random() * REEL_VARIANTS.length)];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const TITLE_SECONDS = 2.6;
const PHOTO_SECONDS = 2.4;
const CLOSING_SECONDS = 2.8;
const FADE_SECONDS = 0.5;

function loadImage(src: string): Promise<HTMLImageElement> {
  // Vercel Blob on this account only supports private stores, so a raw
  // blob.vercel-storage.com URL 401s when fetched directly from the browser
  // - it needs to go through /api/media-proxy (see lib/getMediaUrl.ts) the
  // same way every other image in the app already does. This function used
  // to set img.src to the raw URL, so the venue logo (and any team/session
  // photo actually stored in Blob rather than Supabase Storage) silently
  // failed to load - caught by the .catch(() => null) below in
  // buildAndDownloadReel and just left out of the reel with no error shown.
  const resolved = getMediaUrl(src) || src;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load " + resolved));
    img.src = resolved;
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

function drawBackground(ctx: CanvasRenderingContext2D, variant: ReelVariant) {
  const gradient = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.42, 100, WIDTH / 2, HEIGHT * 0.42, HEIGHT * 0.75);
  gradient.addColorStop(0, "#1a0836");
  gradient.addColorStop(1, "#07030f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (variant.tintOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = variant.tintOpacity;
    ctx.fillStyle = variant.tint;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
  }
}

function drawWordmark(ctx: CanvasRenderingContext2D, y: number, size: number, accent: string) {
  ctx.textAlign = "center";
  ctx.font = `900 ${size}px 'Bruno Ace SC', sans-serif`;
  const label = "QUIZ-IT";
  const quizWidth = ctx.measureText("QUIZ-").width;
  const totalWidth = ctx.measureText(label).width;
  const startX = WIDTH / 2 - totalWidth / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.fillText("QUIZ-", startX, y);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("IT", startX + quizWidth, y);
  ctx.textAlign = "center";
}

async function drawTitleCard(ctx: CanvasRenderingContext2D, variant: ReelVariant) {
  drawBackground(ctx, variant);
  drawWordmark(ctx, HEIGHT * 0.46, 108, variant.accent);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "600 34px 'Inter', sans-serif";
  ctx.fillText("QUIZ NIGHT HIGHLIGHTS", WIDTH / 2, HEIGHT * 0.52);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "500 28px 'Inter', sans-serif";
  ctx.fillText("Powered by Mac Entertainment", WIDTH / 2, HEIGHT * 0.92);
}

async function drawClosingCard(ctx: CanvasRenderingContext2D, venueName: string | null, venueLogo: HTMLImageElement | null, variant: ReelVariant) {
  drawBackground(ctx, variant);
  if (venueLogo) {
    const logoSize = 220;
    const x = WIDTH / 2 - logoSize / 2;
    const y = HEIGHT * 0.32 - logoSize / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(WIDTH / 2, HEIGHT * 0.32, logoSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.strokeStyle = variant.accent;
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
  drawWordmark(ctx, HEIGHT * 0.58, 72, variant.accent);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "600 30px 'Inter', sans-serif";
  ctx.fillText("SEE YOU NEXT QUIZ NIGHT", WIDTH / 2, HEIGHT * 0.64);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "500 26px 'Inter', sans-serif";
  ctx.fillText("Powered by Mac Entertainment", WIDTH / 2, HEIGHT * 0.92);
}

export type ReelResult = { fileExt: string; venueLogoIncluded: boolean; variantName: string; capcutTip: string };

export async function buildAndDownloadReel({ photos, venueName, venueLogoUrl, onProgress }: ReelOptions): Promise<ReelResult> {
  if (typeof document === "undefined") throw new Error("Reel export only runs in the browser");
  if (!("MediaRecorder" in window)) throw new Error("This browser cannot export video. Try Chrome or Edge.");

  const variant = pickVariant();
  const zoomIn = Math.random() < 0.5;

  // Preload every asset up front - a mid-recording image load stall would
  // otherwise show up as a frozen frame in the exported video. Photo order
  // is shuffled per render so the same approved set doesn't play back
  // identically every time.
  let venueLogoLoadFailed = false;
  const [images, venueLogo] = await Promise.all([
    Promise.all(shuffle(photos).map(p => loadImage(p.url).catch(() => null))),
    venueLogoUrl ? loadImage(venueLogoUrl).catch(() => { venueLogoLoadFailed = true; return null; }) : Promise.resolve(null),
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
  // Instagram (and iOS generally) doesn't accept .webm - the host would have
  // to convert it themselves before every post. Safari's MediaRecorder can
  // encode straight to mp4/h264, so prefer that wherever it's supported and
  // only fall back to webm on browsers that can't (current Chrome/Edge) -
  // the download filename below matches whichever format actually got used.
  const mimeType = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1") ? "video/mp4;codecs=avc1"
    : MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9"
    : "video/webm";
  const fileExt = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
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
        drawTitleCard(ctx, variant);
      } else if (elapsed < TITLE_SECONDS + goodImages.length * PHOTO_SECONDS) {
        const into = elapsed - TITLE_SECONDS;
        const idx = Math.min(goodImages.length - 1, Math.floor(into / PHOTO_SECONDS));
        const localT = into - idx * PHOTO_SECONDS;
        drawBackground(ctx, variant);
        // Slow Ken Burns drift so a static photo still reads as motion -
        // direction (zoom in vs zoom out) is randomised once per render.
        const progress = localT / PHOTO_SECONDS;
        const zoom = zoomIn ? 1.05 + progress * 0.08 : 1.13 - progress * 0.08;
        ctx.save();
        if (localT < FADE_SECONDS) ctx.globalAlpha = localT / FADE_SECONDS;
        else if (localT > PHOTO_SECONDS - FADE_SECONDS) ctx.globalAlpha = (PHOTO_SECONDS - localT) / FADE_SECONDS;
        drawCoverImage(ctx, goodImages[idx], zoom);
        ctx.restore();
      } else {
        drawClosingCard(ctx, venueName, venueLogo, variant);
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
  a.download = (venueName ? venueName.replace(/\s+/g, "-").toLowerCase() + "-" : "") + "quiz-it-reel." + fileExt;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { fileExt, venueLogoIncluded: !!venueLogo && !venueLogoLoadFailed, variantName: variant.name, capcutTip: variant.capcutTip };
}
