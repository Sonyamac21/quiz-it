"use client";

import { getMediaUrl } from "@/lib/getMediaUrl";

// Builds a short, looping, branded intro video entirely in the browser -
// same canvas + MediaRecorder technique as buildReel.ts, just landscape
// (TV display shape) and composed from a venue's own profile fields
// instead of quiz-night photos. The point: everything typed into a venue's
// profile (prizes, schedule, host, socials) gets automatically folded into
// one continuously-animated, venue-specific video, rather than the display
// screen switching between separate static "slide" cards.

export type VenueIntroOptions = {
  venueName: string | null;
  venueLogoUrl: string | null;
  prizeInfo: string | null;
  scheduleText: string | null;
  hostName: string | null;
  hostPhotoUrl: string | null;
  website: string | null;
  socialLinks: Record<string, string>;
  onProgress?: (fraction: number) => void;
};

type Variant = { name: string; accent: string; tint: string; tintOpacity: number };

const VARIANTS: Variant[] = [
  { name: "Classic Purple", accent: "#BE26C1", tint: "#BE26C1", tintOpacity: 0 },
  { name: "Warm Glow", accent: "#FF8A3D", tint: "#FF8A3D", tintOpacity: 0.08 },
  { name: "Cool Blue", accent: "#38BDF8", tint: "#38BDF8", tintOpacity: 0.08 },
  { name: "Vintage Film", accent: "#D9A441", tint: "#8B5E2B", tintOpacity: 0.12 },
  { name: "High Contrast", accent: "#FF3B6E", tint: "#FF3B6E", tintOpacity: 0.06 },
];
function pickVariant(): Variant { return VARIANTS[Math.floor(Math.random() * VARIANTS.length)]; }

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const SCENE_SECONDS = 4.2;
const FADE_SECONDS = 0.6;

function loadImage(src: string): Promise<HTMLImageElement> {
  const resolved = getMediaUrl(src) || src;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load " + resolved));
    img.src = resolved;
  });
}

function drawBackground(ctx: CanvasRenderingContext2D, variant: Variant) {
  const gradient = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.4, 100, WIDTH / 2, HEIGHT * 0.4, HEIGHT * 1.1);
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
  const quizWidth = ctx.measureText("QUIZ-").width;
  const totalWidth = ctx.measureText("QUIZ-IT").width;
  const startX = WIDTH / 2 - totalWidth / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.fillText("QUIZ-", startX, y);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("IT", startX + quizWidth, y);
  ctx.textAlign = "center";
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// A slow, continuous scale drift so even a text-only card reads as "video"
// rather than a static slide - subtle enough not to feel like a zoom effect.
function drift(t: number): number { return 1 + t * 0.03; }

type Scene = (ctx: CanvasRenderingContext2D, t: number, variant: Variant) => void;

export type VenueIntroResult = { blob: Blob; mimeType: string; fileExt: string; variantName: string };

export async function buildVenueIntroVideo(opts: VenueIntroOptions): Promise<VenueIntroResult> {
  if (typeof document === "undefined") throw new Error("Video export only runs in the browser");
  if (!("MediaRecorder" in window)) throw new Error("This browser cannot export video. Try Chrome or Edge.");

  const variant = pickVariant();
  const [logo, hostPhoto] = await Promise.all([
    opts.venueLogoUrl ? loadImage(opts.venueLogoUrl).catch(() => null) : Promise.resolve(null),
    opts.hostPhotoUrl ? loadImage(opts.hostPhotoUrl).catch(() => null) : Promise.resolve(null),
  ]);

  const scenes: Scene[] = [];

  scenes.push((ctx, t, v) => {
    drawBackground(ctx, v);
    const zoom = drift(t / SCENE_SECONDS);
    if (logo) {
      const size = 260 * zoom;
      ctx.save();
      ctx.beginPath();
      ctx.arc(WIDTH / 2, HEIGHT * 0.34, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.strokeStyle = v.accent;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.clip();
      ctx.drawImage(logo, WIDTH / 2 - size / 2, HEIGHT * 0.34 - size / 2, size, size);
      ctx.restore();
    }
    ctx.fillStyle = "#fff";
    ctx.font = "800 64px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(opts.venueName || "QUIZ NIGHT", WIDTH / 2, HEIGHT * 0.58);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "600 34px 'Inter', sans-serif";
    ctx.fillText("TONIGHT'S QUIZ NIGHT", WIDTH / 2, HEIGHT * 0.66);
  });

  if (opts.prizeInfo) {
    scenes.push((ctx, t, v) => {
      drawBackground(ctx, v);
      ctx.textAlign = "center";
      ctx.fillStyle = v.accent;
      ctx.font = "700 40px 'Inter', sans-serif";
      ctx.fillText("TONIGHT'S PRIZES", WIDTH / 2, HEIGHT * 0.4);
      ctx.fillStyle = "#fff";
      ctx.font = "600 48px 'Inter', sans-serif";
      const lines = wrapLines(ctx, opts.prizeInfo || "", WIDTH * 0.7);
      lines.slice(0, 4).forEach((line, i) => ctx.fillText(line, WIDTH / 2, HEIGHT * 0.52 + i * 60));
    });
  }

  if (opts.scheduleText) {
    scenes.push((ctx, t, v) => {
      drawBackground(ctx, v);
      ctx.textAlign = "center";
      ctx.fillStyle = v.accent;
      ctx.font = "700 40px 'Inter', sans-serif";
      ctx.fillText("EVERY WEEK", WIDTH / 2, HEIGHT * 0.44);
      ctx.fillStyle = "#fff";
      ctx.font = "800 64px 'Inter', sans-serif";
      ctx.fillText(opts.scheduleText || "", WIDTH / 2, HEIGHT * 0.56);
    });
  }

  if (opts.hostName) {
    scenes.push((ctx, t, v) => {
      drawBackground(ctx, v);
      const zoom = drift(t / SCENE_SECONDS);
      if (hostPhoto) {
        const size = 300 * zoom;
        ctx.save();
        ctx.beginPath();
        ctx.arc(WIDTH / 2, HEIGHT * 0.36, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.strokeStyle = v.accent;
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.clip();
        ctx.drawImage(hostPhoto, WIDTH / 2 - size / 2, HEIGHT * 0.36 - size / 2, size, size);
        ctx.restore();
      }
      ctx.textAlign = "center";
      ctx.fillStyle = v.accent;
      ctx.font = "700 36px 'Inter', sans-serif";
      ctx.fillText("YOUR HOST TONIGHT", WIDTH / 2, HEIGHT * 0.62);
      ctx.fillStyle = "#fff";
      ctx.font = "800 56px 'Inter', sans-serif";
      ctx.fillText(opts.hostName || "", WIDTH / 2, HEIGHT * 0.72);
    });
  }

  const socialHandles = Object.entries(opts.socialLinks || {}).map(([k]) => k);
  if (opts.website || socialHandles.length > 0) {
    scenes.push((ctx, t, v) => {
      drawBackground(ctx, v);
      ctx.textAlign = "center";
      ctx.fillStyle = v.accent;
      ctx.font = "700 40px 'Inter', sans-serif";
      ctx.fillText("FIND US", WIDTH / 2, HEIGHT * 0.44);
      ctx.fillStyle = "#fff";
      ctx.font = "700 52px 'Inter', sans-serif";
      if (opts.website) ctx.fillText(opts.website.replace(/^https?:\/\/(www\.)?/i, ""), WIDTH / 2, HEIGHT * 0.56);
      if (socialHandles.length > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "600 34px 'Inter', sans-serif";
        ctx.fillText(socialHandles.join("   ·   ").toUpperCase(), WIDTH / 2, HEIGHT * (opts.website ? 0.66 : 0.56));
      }
    });
  }

  scenes.push((ctx, t, v) => {
    drawBackground(ctx, v);
    drawWordmark(ctx, HEIGHT * 0.48, 96, v.accent);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "500 30px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Powered by Mac Entertainment", WIDTH / 2, HEIGHT * 0.58);
  });

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.position = "fixed";
  canvas.style.left = "-99999px";
  canvas.style.top = "0";
  document.body.appendChild(canvas);
  const context2d = canvas.getContext("2d");
  if (!context2d) { document.body.removeChild(canvas); throw new Error("Canvas not supported"); }
  const ctx: CanvasRenderingContext2D = context2d;

  const stream = canvas.captureStream(FPS);
  const mimeType = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1") ? "video/mp4;codecs=avc1"
    : MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9"
    : "video/webm";
  const fileExt = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  const totalSeconds = scenes.length * SCENE_SECONDS;
  const startTime = performance.now();
  const finished = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
  recorder.start();

  await new Promise<void>(resolve => {
    function frame() {
      const elapsed = (performance.now() - startTime) / 1000;
      opts.onProgress?.(Math.min(1, elapsed / totalSeconds));
      const idx = Math.min(scenes.length - 1, Math.floor(elapsed / SCENE_SECONDS));
      const localT = elapsed - idx * SCENE_SECONDS;
      ctx.save();
      if (localT < FADE_SECONDS) ctx.globalAlpha = localT / FADE_SECONDS;
      else if (localT > SCENE_SECONDS - FADE_SECONDS) ctx.globalAlpha = (SCENE_SECONDS - localT) / FADE_SECONDS;
      scenes[idx](ctx, localT, variant);
      ctx.restore();
      if (elapsed < totalSeconds) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });

  recorder.stop();
  await finished;
  document.body.removeChild(canvas);

  const blob = new Blob(chunks, { type: mimeType });
  return { blob, mimeType, fileExt, variantName: variant.name };
}
