"use client";
import { useEffect, useRef, useState } from "react";

const SEGMENTS = [
  { label: "-10", value: -10, type: "points", color: "#ef4444" },
  { label: "2nd", value: 2, type: "place", color: "#9333ea" },
  { label: "-30", value: -30, type: "points", color: "#dc2626" },
  { label: "+25", value: 25, type: "bonus", color: "#22c55e" },
  { label: "1st", value: 1, type: "place", color: "#BE26C1" },
  { label: "-20", value: -20, type: "points", color: "#f97316" },
  { label: "3rd", value: 3, type: "place", color: "#7c3aed" },
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
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.05);
    } catch {}
  }

  function playCrowd() {
    try {
      const ctx = getAudioCtx();
      for (let i = 0; i < 8; i++) {
        setTimeout(() => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "sawtooth";
          osc.frequency.value = 200 + Math.random() * 400;
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.4);
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
    const r = cx - 16;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.arc(cx, cy, r + 10, 0, 2 * Math.PI);
    ctx.strokeStyle = "#BE26C1";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#BE26C1";
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.shadowBlur = 0;
    SEGMENTS.forEach((seg, i) => {
      const start = angle + i * SLICE;
      const end = start + SLICE;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + SLICE / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 4;
      ctx.font = "bold 32px sans-serif";
      ctx.fillText(seg.label, r - 18, 8);
      ctx.restore();
    });
    // Center circle with ME logo
    ctx.beginPath();
    ctx.arc(cx, cy, 70, 0, 2 * Math.PI);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.strokeStyle = "#BE26C1";
    ctx.lineWidth = 3;
    ctx.stroke();
    const img = document.getElementById("me-logo") as HTMLImageElement;
    if (img && img.complete) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 68, 0, 2 * Math.PI);
      ctx.clip();
      ctx.drawImage(img, cx - 68, cy - 68, 136, 136);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(cx + r + 18, cy);
    ctx.lineTo(cx + r - 8, cy - 14);
    ctx.lineTo(cx + r - 8, cy + 14);
    ctx.closePath();
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  useEffect(() => { drawWheel(angleRef.current); }, []);

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
        playCrowd();
      }
    }
    rafRef.current = requestAnimationFrame(animate);
  }

  function getResultText(r: Seg) {
    if (r.type === "points") return r.value + " points";
    if (r.type === "bonus") return "+25 bonus points!";
    return "Jump to " + r.label + " place!";
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:20 }}>
      <div style={{ position:"relative", filter: spinning ? "drop-shadow(0 0 24px #BE26C1)" : "none", transition:"filter 0.3s" }}>
        <canvas ref={canvasRef} width={size} height={size} style={{ borderRadius:"50%", display:"block", maxWidth:"90vw", maxHeight:"90vw" }} />
      </div>
      <button onClick={spin} disabled={spinning} style={{ padding:"14px 60px", background: spinning ? "#333" : "linear-gradient(135deg,#BE26C1,#7c3aed)", color:"#fff", border:"none", borderRadius:12, fontSize:22, fontWeight:800, cursor: spinning ? "not-allowed" : "pointer", letterSpacing:2, boxShadow: spinning ? "none" : "0 0 20px #BE26C180", transition:"all 0.2s" }}>
        {spinning ? "SPINNING..." : "SPIN!"}
      </button>
      {result && (
        <div style={{ background:"#111", border:"3px solid " + result.color, borderRadius:16, padding:"16px 32px", textAlign:"center", boxShadow:"0 0 30px " + result.color + "80" }}>
          <p style={{ fontSize:14, color:"#aaa", margin:0 }}>Landed on</p>
          <p style={{ fontSize:48, fontWeight:900, color:result.color, margin:"4px 0" }}>{result.label}</p>
          <p style={{ fontSize:15, color:"#fff", margin:0 }}>{getResultText(result)}</p>
        </div>
      )}
    </div>
  );
}
