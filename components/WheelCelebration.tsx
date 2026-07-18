"use client";
import { useEffect, useRef } from "react";
import { playShowAudio, stopShowAudio } from "@/lib/audio/showAudio";

type Props = { teamName: string; victorySong: string; type: "positive" | "negative"; onDone: () => void; resultLabel?: string; };

export function WheelCelebration({ teamName, victorySong, type, onDone, resultLabel = "" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (type === "positive") { playAirHorn(); playVictorySong(); startFireworks(); }
    else { playSadTrombone(); }
    const timer = setTimeout(() => { cleanup(); onDone(); }, type === "positive" ? 10000 : 5000);
    return () => { clearTimeout(timer); cleanup(); };
  }, []);

  function cleanup() {
    stopShowAudio("music");
    cancelAnimationFrame(rafRef.current);
  }

  function playVictorySong() {
    if (!victorySong) return;
    playShowAudio(victorySong + ".mp3", { channel: "music" });
  }

  function playAirHorn() {
    playShowAudio("airhorn.mp3", { channel: "cue", volume: 0.65 });
  }

    function playSadTrombone() {
    playShowAudio("sad-trombone.mp3", { channel: "cue", volume: 0.7 });
  }

  function startFireworks() {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    type P = { x:number; y:number; vx:number; vy:number; alpha:number; color:string; size:number };
    const particles: P[] = [];
    const colors = ["#BE26C1","#E050E3","#ff6ec7","#fff","#f5c842","#ff4d4d","#44ff88","#44ccff"];
    function burst(x: number, y: number, count: number) {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
        const speed = 4 + Math.random() * 14;
        particles.push({ x, y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed-2, alpha:1, color: colors[Math.floor(Math.random()*colors.length)], size: 3+Math.random()*6 });
      }
    }
    const cw = canvas.width, ch = canvas.height;
    burst(cw*0.5, ch*0.4, 200);
    setTimeout(() => burst(cw*0.2, ch*0.3, 150), 400);
    setTimeout(() => burst(cw*0.8, ch*0.3, 150), 600);
    setTimeout(() => burst(cw*0.5, ch*0.5, 180), 1000);
    setTimeout(() => burst(cw*0.3, ch*0.4, 130), 1600);
    setTimeout(() => burst(cw*0.7, ch*0.35, 130), 2000);
    setTimeout(() => burst(cw*0.5, ch*0.25, 220), 2800);
    setTimeout(() => burst(cw*0.15, ch*0.5, 100), 3500);
    setTimeout(() => burst(cw*0.85, ch*0.5, 100), 3800);
    function animate() {
      ctx.fillStyle = "rgba(0,0,0,0.15)"; ctx.fillRect(0, 0, cw, ch);
      for (let i = particles.length-1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.vx *= 0.98; p.alpha -= 0.011;
        if (p.alpha <= 0) { particles.splice(i,1); continue; }
        ctx.save(); ctx.globalAlpha = p.alpha; ctx.fillStyle = p.color;
        ctx.shadowColor = p.color; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill(); ctx.restore();
      }
      rafRef.current = requestAnimationFrame(animate);
    }
    animate();
  }

  const isPos = type === "positive";
  const bgColor = isPos ? "rgba(10,0,20,0.97)" : "rgba(10,0,0,0.97)";
  const resultColor = isPos ? "#E050E3" : "#FF4444";
  const glowColor = isPos ? "rgba(190,38,193,0.8)" : "rgba(255,68,68,0.8)";
  const subText = isPos ? "Position Secured!" : "Points Deducted";

  return (
    <div onClick={() => { cleanup(); onDone(); }} style={{ position:"fixed", inset:0, zIndex:1000, cursor:"pointer", overflow:"hidden", background: isPos ? "transparent" : bgColor }}>
      {isPos && <canvas ref={canvasRef} style={{ position:"absolute", inset:0, width:"100%", height:"100%", background:"#000" }} />}
      {!isPos && (
        <div style={{ position:"absolute", inset:0, background:"repeating-linear-gradient(45deg, rgba(255,0,0,0.03) 0px, rgba(255,0,0,0.03) 2px, transparent 2px, transparent 20px)" }} />
      )}
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", pointerEvents:"none", gap:20 }}>
        {teamName && (
          <div style={{ fontFamily:"'Inter', sans-serif", fontSize:"clamp(72px,12vw,150px)", color:"#fff", letterSpacing:6 }}>{teamName}</div>
        )}
        <div style={{ fontFamily:"'Inter', sans-serif", fontSize:"clamp(64px,14vw,160px)", color:resultColor, textShadow:"0 0 80px "+glowColor+", 0 0 160px "+glowColor, textAlign:"center", padding:"0 32px", lineHeight:1, fontWeight:900 }}>{resultLabel}</div>
        <div style={{ fontFamily:"'Inter', sans-serif", fontSize:"clamp(16px,2.5vw,28px)", color:"rgba(255,255,255,0.4)", letterSpacing:4 }}>{subText}</div>
        <div style={{ fontFamily:"'Inter', sans-serif", fontSize:12, color:"rgba(255,255,255,0.2)", letterSpacing:3, marginTop:40 }}>tap to continue</div>
      </div>
    </div>
  );
}
