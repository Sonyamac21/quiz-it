"use client";

type Score = { team_name: string; total_points: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function downloadWinnerCard(scores: Score[], format: "vertical" | "square" = "vertical") {
  const sorted = [...scores].sort((a, b) => b.total_points - a.total_points);
  const winner = sorted[0];
  if (!winner) return;

  const W = format === "vertical" ? 1080 : 1080;
  const H = format === "vertical" ? 1920 : 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#1a0535");
  grad.addColorStop(1, "#0d0225");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  let logoBottom = H * 0.18;
  try {
    const logo = await loadImage("/me-logo.jpg");
    const logoSize = 140;
    const logoY = H * 0.08;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.strokeStyle = "#BE26C1";
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.clip();
    ctx.drawImage(logo, cx - logoSize / 2, logoY, logoSize, logoSize);
    ctx.restore();
    logoBottom = logoY + logoSize + 40;
  } catch {}

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 64px sans-serif";
  ctx.fillText("Quiz-It", cx, logoBottom);

  ctx.fillStyle = "rgba(190,38,193,0.8)";
  ctx.font = "500 26px sans-serif";
  ctx.fillText("powered by Mac Entertainment", cx, logoBottom + 44);

  const trophyY = format === "vertical" ? H * 0.42 : H * 0.32;
  ctx.font = "180px sans-serif";
  ctx.fillText("\u{1F3C6}", cx, trophyY);

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "600 32px sans-serif";
  ctx.letterSpacing = "6px";
  ctx.fillText("WINNER", cx, trophyY + 80);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = "#BE26C1";
  ctx.font = "900 96px sans-serif";
  let teamName = winner.team_name;
  if (ctx.measureText(teamName).width > W * 0.85) {
    ctx.font = "900 72px sans-serif";
  }
  ctx.fillText(teamName, cx, trophyY + 180);

  const boxW = 460;
  const boxH = 160;
  const boxY = trophyY + 240;
  roundRect(ctx, cx - boxW / 2, boxY, boxW, boxH, 24);
  ctx.fillStyle = "rgba(34,197,94,0.15)";
  ctx.fill();
  ctx.strokeStyle = "rgba(34,197,94,0.5)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "rgba(34,197,94,0.7)";
  ctx.font = "600 22px sans-serif";
  ctx.letterSpacing = "3px";
  ctx.fillText("FINAL SCORE", cx, boxY + 50);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = "#22c55e";
  ctx.font = "900 64px sans-serif";
  ctx.fillText(String(winner.total_points), cx, boxY + 120);

  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "500 24px sans-serif";
  ctx.letterSpacing = "3px";
  ctx.fillText("QUIZ-IT POWERED BY MAC ENTERTAINMENT", cx, H - 60);
  ctx.letterSpacing = "0px";
  ctx.font = "400 18px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillText("by Sonya Mac", cx, H - 30);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quiz-it-winner-" + winner.team_name.replace(/\s+/g, "-").toLowerCase() + "-" + format + ".png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, "image/png");
}
