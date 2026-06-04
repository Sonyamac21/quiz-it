"use client";
import { useEffect, useRef, useState } from "react";

const SEGMENTS = [
  { label: "1st Place", value: 1, type: "place", color: "#BE26C1" },
  { label: "-10 pts", value: -10, type: "points", color: "#1a1a2e" },
  { label: "2nd Place", value: 2, type: "place", color: "#8B1A8E" },
  { label: "-5 pts", value: -5, type: "points", color: "#1a1a2e" },
  { label: "3rd Place", value: 3, type: "place", color: "#5A0D5C" },
  { label: "-15 pts", value: -15, type: "points", color: "#1a1a2e" },
  { label: "-10 pts", value: -10, type: "points", color: "#1a1a2e" },
  { label: "-5 pts", value: -5, type: "points", color: "#1a1a2e" },
];

const TOTAL = SEGMENTS.length;
const SLICE = (2 * Math.PI) / TOTAL;

type Seg = typeof SEGMENTS[0];
type Props = { onResult: (seg: Seg) => void; size?: number };

export function SpinWheel({ onResult, size = 520 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Seg | null>(null);
  const angleRef = useRef(0);
  const velRef = useRef(0);
  const rafRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastTickAngle = useRef(0);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const lightFrame = useRef<number>(0);

  useEffect(() => {
    const img = new Image();
    img.src = "/me-logo.jpg";
    img.onload = () => { logoRef.current = img; drawWheel(angleRef.current); };
    logoRef.current = img;
    function animateLights() {
      if (!spinning) drawWheel(angleRef.current);
      lightFrame.current = requestAnimationFrame(animateLights);
    }
    lightFrame.current = requestAnimationFrame(animateLights);
    return () => cancelAnimationFrame(lightFrame.current);
  }, [spinning]);

  function getAudioCtx() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  }

  function playTick(vol: number = 0.3) {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.05);
    } catch {}
  }

  function playCrowd() {
    try {
      const ctx = getAudioCtx();
      for (let i = 0; i < 8; i++) {
        setTimeout(() => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = "sawtooth";
          osc.frequency.value = 200 + Math.random() * 400;
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
          osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
        }, i * 80);
      }
    } catch {}
  }

  function drawWheel(angle: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r = cx - 20;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    SEGMENTS.forEach((seg, i) => {
      const start = angle + i * SLICE;
      const end = start + SLICE;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      if (seg.type === "place") {
        const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
        grad.addColorStop(0, "rgba(190,38,193,0.3)");
        grad.addColorStop(1, "rgba(190,38,193,0.05)");
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, start, end);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(190,38,193,0.3)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + SLICE / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = seg.type === "points" ? (seg.value <= -15 ? "#FF4444" : "#FF7777") : "#fff";
      ctx.shadowColor = seg.type === "place" ? "#BE26C1" : "rgba(0,0,0,0.8)";
      ctx.shadowBlur = seg.type === "place" ? 10 : 4;
      ctx.font = `bold ${size > 400 ? 28 : 20}px sans-serif`;
      ctx.fillText(seg.label, r - 20, 10);
      ctx.restore();
    });

    const t = Date.now() / 380;
    for (let i = 0; i < 20; i++) {
      const a = angle + (i * Math.PI * 2 / 20) - Math.PI / 2;
      const px = cx + Math.cos(a) * (r + 10);
      const py = cy + Math.sin(a) * (r + 10);
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      const pulse = 0.35 + 0.65 * Math.abs(Math.sin(t + i * 0.65));
      ctx.fillStyle = i % 2 === 0 ? `rgba(190,38,193,${pulse})` : `rgba(212,78,215,${pulse * 0.5})`;
      ctx.fill();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(190,38,193,0.8)";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#BE26C1";
    ctx.shadowBlur = 15;
    ctx.stroke();
    ctx.shadowBlur = 0;

    const hubR = size > 400 ? 70 : 50;
    ctx.beginPath();
    ctx.arc(cx, cy, hubR, 0, 2 * Math.PI);
    ctx.fillStyle = "#080810";
    ctx.fill();
    ctx.strokeStyle = "#BE26C1";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#BE26C1";
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (logoRef.current && logoRef.current.complete && logoRef.current.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, hubR - 3, 0, 2 * Math.PI);
      ctx.clip();
      ctx.drawImage(logoRef.current, cx - (hubR - 3), cy - (hubR - 3), (hubR - 3) * 2, (hubR - 3) * 2);
      ctx.restore();
    }

    const pSize = 18;
    ctx.save();
    ctx.translate(cx, cy - r - 10);
    ctx.beginPath();
    ctx.moveTo(0, pSize);
    ctx.lineTo(-pSize * 0.6, -pSize * 0.4);
    ctx.lineTo(pSize * 0.6, -pSize * 0.4);
    ctx.closePath();
    ctx.fillStyle = "#BE26C1";
    ctx.shadowColor = "#BE26C1";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function spin() {
    if (spinning) return;
    setSpinning(true);
    setResult(null);
    velRef.current = 0.28 + Math.random() * 0.18;
    lastTickAngle.current = angleRef.current;
    function animate() {
      velRef.current *= 0.9915;
      angleRef.current += velRef.current;
      if (Math.abs(angleRef.current - lastTickAngle.current) >= SLICE) {
        lastTickAngle.current = angleRef.current;
        playTick(Math.min(0.4, velRef.current * 1.5));
      }
      drawWheel(angleRef.current);
      if (velRef.current > 0.003) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setSpinning(false);
        const normalized = ((angleRef.current % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const relative = ((0 - normalized) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const index = Math.floor(relative / SLICE) % TOTAL;
        const landed = SEGMENTS[index];
        setResult(landed);
        onResult(landed);
        if (landed.type === "place") playCrowd();
      }
    }
    rafRef.current = requestAnimationFrame(animate);
  }

  function getResultText(r: Seg) {
    if (r.type === "points") return r.value + " points from your score";
    return "Jump to " + (r.value === 1 ? "1st" : r.value === 2 ? "2nd" : "3rd") + " place!";
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:20, fontFamily:"'Bruno Ace SC', sans-serif" }}>
      <div style={{ position:"relative", filter: spinning ? "drop-shadow(0 0 24px #BE26C1)" : "drop-shadow(0 0 8px rgba(190,38,193,0.3))", transition:"filter 0.3s" }}>
        <canvas ref={canvasRef} width={size} height={size} style={{ borderRadius:"50%", display:"block", maxWidth:"90vw", maxHeight:"90vw" }} />
      </div>
      <button onClick={spin} disabled={spinning} style={{ padding:"14px 60px", background: spinning ? "#1a1a2e" : "#BE26C1", color:"#fff", border:"none", borderRadius:50, fontSize:18, fontFamily:"'Bruno Ace SC', sans-serif", letterSpacing:3, cursor: spinning ? "not-allowed" : "pointer", boxShadow: spinning ? "none" : "0 0 24px rgba(190,38,193,0.6)", transition:"all 0.2s", opacity: spinning ? 0.5 : 1 }}>
        {spinning ? "Spinning..." : "Spin The Wheel"}
      </button>
      {result && (
        <div style={{ background:"#0d0d1a", border:"2px solid " + (result.type === "place" ? "#BE26C1" : "#FF4444"), borderRadius:16, padding:"16px 32px", textAlign:"center", boxShadow:"0 0 30px " + (result.type === "place" ? "rgba(190,38,193,0.5)" : "rgba(255,68,68,0.3)") }}>
          <p style={{ fontSize:12, color:"rgba(255,255,255,0.4)", margin:0, fontFamily:"'Bruno Ace SC', sans-serif", letterSpacing:2 }}>Result</p>
          <p style={{ fontSize:40, fontWeight:900, color: result.type === "place" ? "#BE26C1" : "#FF5555", margin:"6px 0", fontFamily:"'Bruno Ace SC', sans-serif" }}>{result.label}</p>
          <p style={{ fontSize:14, color:"#fff", margin:0, fontFamily:"'Bruno Ace SC', sans-serif", letterSpacing:1 }}>{getResultText(result)}</p>
        </div>
      )}
    </div>
  );
}
