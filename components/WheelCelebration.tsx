"use client";
import { useEffect, useRef } from "react";

type Props = {
  teamName: string;
  victorySong: string;
  type: "positive" | "negative";
  onDone: () => void;
};

export function WheelCelebration({ teamName, victorySong, type, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (type === "positive") {
      playVictorySong();
      playChamagnePop();
      startFireworks();
    } else {
      playSadTrombone();
    }
    const timer = setTimeout(() => {
      cleanup();
      onDone();
    }, type === "positive" ? 9000 : 4000);
    return () => { clearTimeout(timer); cleanup(); };
  }, []);

  function cleanup() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    cancelAnimationFrame(rafRef.current);
  }

  function playVictorySong() {
    if (!victorySong) return;
    const audio = new Audio(`/sounds/${victorySong}.mp3`);
    audio.volume = 0.85;
    audio.play().catch(() => {});
    audioRef.current = audio;
  }

  function playChamagnePop() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const pop = ctx.createOscillator();
      const popGain = ctx.createGain();
      pop.connect(popGain); popGain.connect(ctx.destination);
      pop.type = "sine";
      pop.frequency.setValueAtTime(800, ctx.currentTime);
      pop.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.15);
      popGain.gain.setValueAtTime(1, ctx.currentTime);
      popGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      pop.start(ctx.currentTime); pop.stop(ctx.currentTime + 0.3);
      const noise = ctx.createOscillator();
      const noiseGain = ctx.createGain();
      noise.connect(noiseGain); noiseGain.connect(ctx.destination);
      noise.type = "sawtooth";
      noise.frequency.setValueAtTime(150, ctx.currentTime + 0.05);
      noiseGain.gain.setValueAtTime(0.4, ctx.currentTime + 0.05);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      noise.start(ctx.currentTime + 0.05); noise.stop(ctx.currentTime + 0.5);
      for (let i = 0; i < 6; i++) {
        const t = ctx.currentTime + 0.1 + i * 0.08;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 400 + Math.random() * 800;
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        o.start(t); o.stop(t + 0.2);
      }
    } catch {}
  }

  function playSadTrombone() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const notes = [466, 415, 370, 311];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sawtooth";
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.38;
        gain.gain.setValueAtTime(0.35, t);
        gain.gain.linearRampToValueAtTime(0.25, t + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
        osc.start(t); osc.stop(t + 0.65);
      });
    } catch {}
  }

  function startFireworks() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    type Particle = {
      x: number; y: number; vx: number; vy: number;
      alpha: number; color: string; size: number; trail: {x:number;y:number}[];
    };

    const particles: Particle[] = [];
    const colors = ["#BE26C1","#E050E3","#ff6ec7","#ffffff","#f5c842","#ff4d4d","#44ff88","#44ccff","#ffaa00"];

    function burst(x: number, y: number, count: number) {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
        const speed = 4 + Math.random() * 12;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          alpha: 1,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 2.5 + Math.random() * 5,
          trail: [],
        });
      }
    }

    burst(canvas.width * 0.5, canvas.height * 0.4, 180);
    setTimeout(() => burst(canvas.width * 0.25, canvas.height * 0.35, 140), 300);
    setTimeout(() => burst(canvas.width * 0.75, canvas.height * 0.3, 140), 500);
    setTimeout(() => burst(canvas.width * 0.5, canvas.height * 0.5, 160), 900);
    setTimeout(() => burst(canvas.width * 0.3, canvas.height * 0.45, 120), 1400);
    setTimeout(() => burst(canvas.width * 0.7, canvas.height * 0.4, 120), 1700);
    setTimeout(() => burst(canvas.width * 0.5, canvas.height * 0.3, 200), 2400);
    setTimeout(() => burst(canvas.width * 0.2, canvas.height * 0.5, 100), 3000);
    setTimeout(() => burst(canvas.width * 0.8, canvas.height * 0.5, 100), 3200);

    let frame = 0;
    function animate() {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.trail.push({x: p.x, y: p.y});
        if (p.trail.length > 6) p.trail.shift();
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.18;
        p.vx *= 0.98;
        p.alpha -= 0.014;
        if (p.alpha <= 0) { particles.splice(i, 1); continue; }
        for (let t = 0; t < p.trail.length; t++) {
          ctx.save();
          ctx.globalAlpha = p.alpha * (t / p.trail.length) * 0.4;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.trail[t].x, p.trail[t].y, p.size * 0.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      frame++;
      rafRef.current = requestAnimationFrame(animate);
    }
    animate();
  }

  if (type === "negative") {
    return (
      <div
        onClick={() => { cleanup(); onDone(); }}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.93)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          zIndex: 1000, cursor: "pointer",
        }}
      >
        <div style={{ fontSize: 80, marginBottom: 16 }}>😬</div>
        <div style={{
          fontFamily: "'Bruno Ace SC', sans-serif",
          fontSize: 52, color: "#FF4444",
          letterSpacing: "3px",
          textShadow: "0 0 40px rgba(255,68,68,0.7)",
        }}>Oh No!</div>
        <div style={{
          fontFamily: "'Bruno Ace SC', sans-serif",
          fontSize: 22, cor: "rgba(255,255,255,0.6)",
          marginTop: 14, letterSpacing: "2px",
        }}>{teamName}</div>
        <div style={{
          fontFamily: "'Bruno Ace SC', sans-serif",
          fontSize: 11, color: "rgba(255,255,255,0.25)",
          marginTop: 48, letterSpacing: "2px",
        }}>tap to continue</div>
      </div>
    );
  }

  return (
    <div
      onClick={() => { cleanup(); onDone(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1000, cursor: "pointer", overflow: "hidden" }}
    >
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "#000" }} />
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        pointerEvents: "none",
      }}>
        <div style={{
          fontFamily: "'Bruno Ace SC', sans-serif",
          fontSize: 22, color: "rgba(255,255,255,0.5)",
          letterSpacing: "4px", marginBottom: 16,
        }}>Winner!</div>
        <div style={{
          fontFamily: "'Bruno Ace SC', sans-serif",
          fontSize: 72, color: "#BE26C1",
          letterSpacing: "4px",
          textShadow: "0 0 50px rgba(190,38,193,1), 0 0 100px rgba(190,38,193,0.6)",
          textAlign: "center", padding: "0 24px",
          animation: "teamPulse 0.7s infinite alternate",
        }}>{teamName}</div>
        <div style={{
          fontFamily: "'Bruno Ace SC', sans-serif",
          fontSize: 12, color: "rgba(255,255,255,0.35)",
          marginTop: 48, letterSpacing: "2px",
        }}>tap to continue</div>
      </div>
      <style>{`
        @keyframes teamPulse {
          from { transform: scale(1); text-shadow: 0 0 50px rgba(190,38,193,1), 0 0 100px rgba(190,38,193,0.6); }
          to { transform: scale(1.06); text-shadow: 0 0 80px rgba(190,38,193,1), 0 0 160px rgba(190,38,193,0.8), 0 0 200px rgba(255,100,255,0.4); }
        }
      `}</style>
    </div>
  );
}
