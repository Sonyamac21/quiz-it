"use client";

type Score = { team_name: string; total_points: number };
type TeamInfo = { team_name: string; photo_url?: string | null };

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

export async function downloadWinnerCard(
  scores: Score[],
  teams: TeamInfo[] = [],
  venueName: string | null = null,
  format: "vertical" | "square" = "vertical"
) {
  const sorted = [...scores].sort((a, b) => b.total_points - a.total_points);
  const winner = sorted[0];
  if (!winner) return;
  const winnerTeam = teams.find(t => t.team_name === winner.team_name);

  const W = 1080;
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
  let logoBottom = H * 0.13;
  try {
    const logo = await loadImage("/me-logo.jpg");
    const logoSize = 120;
    const logoY = H * 0.05;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.strokeStyle = "#BE26C1";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.clip();
    ctx.drawImage(logo, cx - logoSize / 2, logoY, logoSize, logoSize);
    ctx.restore();
    logoBottom = logoY + logoSize + 36;
  } catch {}

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 56px sans-serif";
  ctx.fillText("Quiz-It", cx, logoBottom);

  ctx.fillStyle = "rgba(190,38,193,0.8)";
  ctx.font = "500 24px sans-serif";
  ctx.fillText("powered by Mac Entertainment", cx, logoBottom + 40);

  if (venueName) {
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "500 22px sans-serif";
    ctx.letterSpacing = "2px";
    ctx.fillText(venueName.toUpperCase(), cx, logoBottom + 76);
    ctx.letterSpacing = "0px";
  }

  // Photo (big, circular) - falls back to a trophy emoji if no team photo
  const photoY = format === "vertical" ? H * 0.27 : H * 0.18;
  const photoSize = format === "vertical" ? 420 : 320;
  let photoBottom = photoY + photoSize;
  let drewPhoto = false;
  if (winnerTeam?.photo_url) {
    try {
      const photo = await loadImage(winnerTeam.photo_url);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, photoY + photoSize / 2, photoSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.lineWidth = 10;
      ctx.strokeStyle = "#facc15";
      ctx.stroke();
      ctx.shadowColor = "rgba(250,204,21,0.6)";
      ctx.shadowBlur = 40;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.clip();
      // cover-fit the photo into the circle
      const scale = Math.max(photoSize / photo.width, photoSize / photo.height);
      const dw = photo.width * scale;
      const dh = photo.height * scale;
      ctx.drawImage(photo, cx - dw / 2, photoY + photoSize / 2 - dh / 2, dw, dh);
      ctx.restore();
      drewPhoto = true;
    } catch {}
  }
  if (!drewPhoto) {
    ctx.font = (format === "vertical" ? "180px" : "140px") + " sans-serif";
    ctx.fillText("\u{1F3C6}", cx, photoY + photoSize * 0.75);
    photoBottom = photoY + photoSize * 0.6;
  }

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "600 30px sans-serif";
  ctx.letterSpacing = "6px";
  ctx.fillText("WINNER", cx, photoBottom + 60);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = "#BE26C1";
  ctx.font = "900 90px sans-serif";
  const teamName = winner.team_name;
  if (ctx.measureText(teamName).width > W * 0.85) {
    ctx.font = "900 68px sans-serif";
  }
  ctx.fillText(teamName, cx, photoBottom + 150);

  const boxW = 440;
  const boxH = 150;
  const boxY = photoBottom + 200;
  roundRect(ctx, cx - boxW / 2, boxY, boxW, boxH, 24);
  ctx.fillStyle = "rgba(34,197,94,0.15)";
  ctx.fill();
  ctx.strokeStyle = "rgba(34,197,94,0.5)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "rgba(34,197,94,0.7)";
  ctx.font = "600 20px sans-serif";
  ctx.letterSpacing = "3px";
  ctx.fillText("FINAL SCORE", cx, boxY + 48);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = "#22c55e";
  ctx.font = "900 60px sans-serif";
  ctx.fillText(String(winner.total_points), cx, boxY + 116);

  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "500 22px sans-serif";
  ctx.letterSpacing = "3px";
  ctx.fillText("QUIZ-IT POWERED BY MAC ENTERTAINMENT", cx, H - 56);
  ctx.letterSpacing = "0px";
  ctx.font = "400 17px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillText("by Sonya Mac", cx, H - 28);

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
