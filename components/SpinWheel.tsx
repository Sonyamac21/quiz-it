"use client";
import { useEffect, useRef, useState } from "react";

const SEGS = [
  { label:"1st Place", type:"place", bg:"#BE26C1", accent:"#E050E3", text:"#fff" },
  { label:"-10 pts",   type:"neg",   bg:"#1A0A2E", accent:"#7C3AED", text:"#FF8888" },
  { label:"2nd Place", type:"place", bg:"#7C3AED", accent:"#A855F7", text:"#fff" },
  { label:"-20 pts",   type:"neg",   bg:"#150818", accent:"#6B21A8", text:"#FF6666" },
  { label:"3rd Place", type:"place", bg:"#5A0D9C", accent:"#8B5CF6", text:"#fff" },
  { label:"-30 pts",   type:"neg",   bg:"#0D0820", accent:"#4C1D95", text:"#FF4444" },
  { label:"+50 pts",   type:"bonus", bg:"#0A1F0A", accent:"#16A34A", text:"#4ADE80" },
  { label:"Last Place",type:"last",  bg:"#200A0A", accent:"#991B1B", text:"#FCA5A5" },
];

const N = SEGS.length;
type Seg = typeof SEGS[0];
type Props = { onResult: (seg: Seg) => void; size?: number; teamName?: string };

export function SpinWheel({ onResult, size = 400 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [spinning, setSpinning] = useState(false);
  const offsetRef = useRef(0);
  const lightRaf = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastTickOffset = useRef(0);

  const W = size, H = Math.round(size * 1.05);
  const CX = W/2, CY = H/2;
  const DW = Math.round(W * 0.74), DH = Math.round(H * 0.9);
  const RX = Math.round(W * 0.11), SH = DH / 4.8;

  function getAudioCtx() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current!;
  }

  function playTick(vol = 0.2) {
    try {
      const ac = getAudioCtx();
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.frequency.value = 600;
      g.gain.setValueAtTime(vol, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.04);
      o.start(ac.currentTime); o.stop(ac.currentTime + 0.04);
    } catch {}
  }

  function drawDrum(off: number) {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dy = CY - DH/2;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    const clip = new Path2D();
    clip.ellipse(CX, dy, RX, 14, 0, Math.PI, 0, true);
    clip.lineTo(CX+DW/2, dy); clip.lineTo(CX+DW/2, dy+DH);
    clip.ellipse(CX, dy+DH, RX, 14, 0, 0, Math.PI, true);
    clip.lineTo(CX-DW/2, dy+DH); clip.lineTo(CX-DW/2, dy);
    ctx.clip(clip);

    for (let i = -6; i <= 6; i++) {
      const idx = ((Math.floor(off) + i) % N + N) % N;
      const seg = SEGS[idx];
      const frac = off - Math.floor(off);
      const segCY = CY + (i - frac) * SH;
      if (segCY < dy - SH || segCY > dy + DH + SH) continue;
      const norm = Math.min(Math.abs(segCY - CY) / (DH/2), 1);
      const shade = 1 - norm * 0.72;
      const segTop = segCY - SH/2, segBot = segCY + SH/2;
      const cTop = Math.max(segTop, dy), cBot = Math.min(segBot, dy+DH);
      if (cTop >= cBot) continue;
      ctx.save();
      ctx.beginPath(); ctx.rect(CX-DW/2, cTop, DW, cBot-cTop); ctx.clip();
      ctx.globalAlpha = shade * 0.88 + 0.12;
      ctx.fillStyle = seg.bg; ctx.fillRect(CX-DW/2, cTop, DW, cBot-cTop);
      const shine = ctx.createLinearGradient(CX-DW/2, 0, CX+DW/2, 0);
      shine.addColorStop(0, "rgba(0,0,0,0.5)");
      shine.addColorStop(0.5, "rgba(255,255,255,0.08)");
      shine.addColorStop(1, "rgba(0,0,0,0.5)");
      ctx.fillStyle = shine; ctx.fillRect(CX-DW/2, cTop, DW, cBot-cTop);
      ctx.globalAlpha = shade * 0.8;
      ctx.strokeStyle = seg.accent + "CC"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(CX-DW/2+10, segTop+0.5); ctx.lineTo(CX+DW/2-10, segTop+0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CX-DW/2+10, segBot-0.5); ctx.lineTo(CX+DW/2-10, segBot-0.5); ctx.stroke();
      ctx.globalAlpha = shade;
      const fs = Math.max(14, Math.round(16 + 10 * shade));
      ctx.font = "900 " + fs + "px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = seg.text;
      if (shade > 0.65) { ctx.shadowColor = seg.accent; ctx.shadowBlur = 14 * shade; }
      ctx.fillText(seg.label, CX, segCY);
      ctx.shadowBlur = 0; ctx.restore();
    }

    const sideShade = ctx.createLinearGradient(CX-DW/2, 0, CX+DW/2, 0);
    sideShade.addColorStop(0, "rgba(0,0,0,0.75)");
    sideShade.addColorStop(0.07, "rgba(0,0,0,0)");
    sideShade.addColorStop(0.93, "rgba(0,0,0,0)");
    sideShade.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = sideShade; ctx.globalAlpha = 1; ctx.fillRect(CX-DW/2, dy, DW, DH);
    const topFade = ctx.createLinearGradient(0, dy, 0, dy+DH*0.2);
    topFade.addColorStop(0, "rgba(8,8,16,0.96)"); topFade.addColorStop(1, "rgba(8,8,16,0)");
    ctx.fillStyle = topFade; ctx.fillRect(CX-DW/2, dy, DW, DH*0.2);
    const botFade = ctx.createLinearGradient(0, dy+DH*0.8, 0, dy+DH);
    botFade.addColorStop(0, "rgba(8,8,16,0)"); botFade.addColorStop(1, "rgba(8,8,16,0.96)");
    ctx.fillStyle = botFade; ctx.fillRect(CX-DW/2, dy+DH*0.8, DW, DH*0.2);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = "#BE26C1"; ctx.shadowBlur = 16;
    ctx.strokeStyle = "rgba(190,38,193,0.9)"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(CX, dy, RX, 14, 0, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(CX, dy+DH, RX, 14, 0, 0, Math.PI*2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(190,38,193,0.65)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(CX-DW/2, dy); ctx.lineTo(CX-DW/2, dy+DH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX+DW/2, dy); ctx.lineTo(CX+DW/2, dy+DH); ctx.stroke();
    const t = Date.now()/320;
    for (let i = 0; i < 16; i++) {
      const px = CX-DW/2 + i*(DW/15);
      const pulse = 0.25 + 0.75*Math.abs(Math.sin(t + i*0.55));
      ctx.beginPath(); ctx.arc(px, dy-12, 5, 0, Math.PI*2);
      ctx.fillStyle = i%2===0 ? "rgba(190,38,193,"+pulse+")" : "rgba(224,80,227,"+(pulse*0.5)+")";
      ctx.fill();
      ctx.beginPath(); ctx.arc(px, dy+DH+12, 5, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  function getResult() { return SEGS[((Math.round(offsetRef.current)) % N + N) % N]; }
  function loopLights() { drawDrum(offsetRef.current); lightRaf.current = requestAnimationFrame(loopLights); }

  useEffect(() => {
    drawDrum(offsetRef.current);
    lightRaf.current = requestAnimationFrame(loopLights);
    return () => cancelAnimationFrame(lightRaf.current);
  }, []);

  function spin() {
    if (spinning) return;
    setSpinning(true);
    cancelAnimationFrame(lightRaf.current);
    lastTickOffset.current = offsetRef.current;
    const extra = -(30 + Math.floor(Math.random()*10)) - Math.random();
    const target = offsetRef.current + extra;
    const dur = 9000 + Math.random()*2000;
    const t0 = performance.now(), o0 = offsetRef.current;
    function ease(t: number) { return 1 - Math.pow(1 - t, 5); }
    function tick(now: number) {
      const t = Math.min((now - t0) / dur, 1);
      offsetRef.current = o0 + (target - o0) * ease(t);
      if (Math.abs(offsetRef.current - lastTickOffset.current) >= 1) {
        lastTickOffset.current = offsetRef.current;
        playTick(Math.max(0.05, 0.25 * (1 - t)));
      }
      drawDrum(offsetRef.current);
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        setSpinning(false);
        lightRaf.current = requestAnimationFrame(loopLights);
        const seg = getResult();
        setTimeout(() => { onResult(seg); }, 50);
      }
    }
    requestAnimationFrame(tick);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
      <div style={{ position:"relative" }}>
        <div style={{ position:"absolute", left:-18, top:"50%", transform:"translateY(-50%)", width:0, height:0, borderTop:"20px solid transparent", borderBottom:"20px solid transparent", borderLeft:"34px solid #BE26C1", filter:"drop-shadow(0 0 10px rgba(190,38,193,0.9))", zIndex:10 }} />
        <div style={{ position:"absolute", right:-18, top:"50%", transform:"translateY(-50%)", width:0, height:0, borderTop:"20px solid transparent", borderBottom:"20px solid transparent", borderRight:"34px solid #BE26C1", filter:"drop-shadow(0 0 10px rgba(190,38,193,0.9))", zIndex:10 }} />
        <div style={{ position:"absolute", left:0, right:0, top:"50%", height:2, background:"linear-gradient(90deg,transparent,rgba(190,38,193,0.6),transparent)", transform:"translateY(-50%)", zIndex:5 }} />
        <canvas ref={canvasRef} width={W} height={H} style={{ display:"block", maxWidth:"90vw" }} />
      </div>
      <button onClick={spin} disabled={spinning} style={{ padding:"14px 52px", background:spinning?"#1a1a2e":"#BE26C1", color:"#fff", border:"none", borderRadius:50, fontSize:18, fontFamily:"sans-serif", letterSpacing:3, cursor:spinning?"not-allowed":"pointer", boxShadow:spinning?"none":"0 0 24px rgba(190,38,193,0.5)", opacity:spinning?0.4:1, transition:"all 0.2s" }}>
        {spinning ? "Spinning..." : "Spin The Wheel"}
      </button>
    </div>
  );
}
