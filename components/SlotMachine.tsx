"use client";
import { useEffect, useRef, useState, useCallback } from "react";

const SEGS = [
  { label: "1st Place",  color: "#F5C842", bg: "#221800", positive: true  },
  { label: "-10 Points", color: "#f87171", bg: "#1e0606", positive: false },
  { label: "2nd Place",  color: "#c8c8d8", bg: "#141420", positive: true  },
  { label: "-20 Points", color: "#fb923c", bg: "#1e0e00", positive: false },
  { label: "3rd Place",  color: "#BE26C1", bg: "#1a0530", positive: true  },
  { label: "-30 Points", color: "#ef4444", bg: "#1e0404", positive: false },
  { label: "+50 Points", color: "#22c55e", bg: "#041408", positive: true  },
  { label: "Last Place", color: "#dc2626", bg: "#180202", positive: false },
];

const SEG_H = 80;
const STRIP_COUNT = 20;
const STRIP: typeof SEGS = [];
for (let i = 0; i < STRIP_COUNT; i++) STRIP.push(...SEGS);
const STRIP_LEN = STRIP.length;
const BC = 14;

function centredSegIdx(topPx: number) {
  const stripIdx = Math.round(-topPx / SEG_H) + 1;
  const clamped = ((stripIdx % STRIP_LEN) + STRIP_LEN) % STRIP_LEN;
  return clamped % SEGS.length;
}


function OverlayPanel({ overlay, teamName, onDismiss }: { overlay: { label: string; color: string; positive: boolean }; teamName: string; onDismiss: () => void }) {
  const bg = overlay.positive ? "rgba(0,8,2,0.92)" : "rgba(12,0,0,0.92)";
  const shadow = "0 0 40px " + overlay.color;
  return (
    <div style={{ position: "absolute", inset: 0, borderRadius: 16, background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, zIndex: 15 }}>
      <div style={{ fontSize: 12, letterSpacing: 4, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{teamName}</div>
      <div style={{ fontSize: 52, letterSpacing: 3, color: overlay.color, textAlign: "center", lineHeight: 1.1, textShadow: shadow }}>{overlay.label}</div>
      <button onClick={onDismiss} style={{ marginTop: 8, fontFamily: "var(--font-bruno)", fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,0.35)", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "8px 24px", cursor: "pointer" }}>
        Continue
      </button>
    </div>
  );
}

export default function SlotMachine({ teamName = "The Brainy Bunch" }: { teamName?: string }) {
  const reelRefs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
  ];
  const reelTops = useRef([0, 0, 0]);
  const [spinning, setSpinning] = useState(false);
  const [overlay, setOverlay] = useState<typeof SEGS[0] | null>(null);
  const [bulbTick, setBulbTick] = useState(0);
  const [bulbGolden, setBulbGolden] = useState(false);
  const bulbRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fwRef = useRef<number | null>(null);
  const fwCanvasRef = useRef<HTMLCanvasElement>(null);

  const INITIAL_CENTRE = Math.floor(STRIP_LEN / 2);
  const INITIAL_TOP = -(INITIAL_CENTRE - 1) * SEG_H;

  useEffect(() => {
    reelTops.current = [INITIAL_TOP, INITIAL_TOP, INITIAL_TOP];
    reelRefs.forEach((r) => {
      if (r.current) r.current.style.top = INITIAL_TOP + "px";
    });
  }, []);

  const stopBulbs = useCallback(() => {
    if (bulbRef.current) clearInterval(bulbRef.current);
    bulbRef.current = null;
    setBulbTick(-99);
    setBulbGolden(false);
  }, []);

  const startBulbs = useCallback((golden: boolean) => {
    stopBulbs();
    setBulbGolden(golden);
    let t = 0;
    bulbRef.current = setInterval(() => { t++; setBulbTick(t); }, golden ? 140 : 280);
  }, [stopBulbs]);

  useEffect(() => () => { stopBulbs(); }, [stopBulbs]);

  const animReel = (
    reelIdx: number,
    fromTop: number,
    toTop: number,
    dur: number,
    delay: number,
    cb?: () => void
  ) => {
    let t0: number | null = null;
    setTimeout(() => {
      const step = (ts: number) => {
        if (!t0) t0 = ts;
        const p = Math.min((ts - t0) / dur, 1);
        const e = 1 - Math.pow(1 - p, 4);
        const cur = fromTop + (toTop - fromTop) * e;
        reelTops.current[reelIdx] = cur;
        if (reelRefs[reelIdx].current) reelRefs[reelIdx].current.style.top = cur + "px";
        if (p < 1) requestAnimationFrame(step);
        else {
          reelTops.current[reelIdx] = toTop;
          if (reelRefs[reelIdx].current) reelRefs[reelIdx].current.style.top = toTop + "px";
          if (cb) cb();
        }
      };
      requestAnimationFrame(step);
    }, delay);
  };

  const launchFW = (col: string) => {
    const cv = fwCanvasRef.current;
    const root = cv?.parentElement;
    if (!cv || !root) return;
    cv.width = root.offsetWidth;
    cv.height = root.offsetHeight;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const pts: { x:number; y:number; vx:number; vy:number; c:string; l:number; d:number }[] = [];
    const cols = [col, "#BE26C1", "#F5C842", "#fff", "#22c55e", "#c8c8d8"];
    for (let b = 0; b < 12; b++) {
      setTimeout(() => {
        const cx = 50 + Math.random() * (cv.width - 100);
        const cy = 30 + Math.random() * (cv.height * 0.5);
        for (let p = 0; p < 40; p++) {
          const a = (p / 40) * Math.PI * 2;
          const spd = 2 + Math.random() * 6;
          pts.push({ x: cx, y: cy, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd, c: cols[Math.floor(Math.random()*cols.length)], l: 1, d: 0.01 + Math.random()*0.016 });
        }
      }, b * 200);
    }
    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.07; p.vx *= 0.98; p.vy *= 0.98; p.l -= p.d;
        if (p.l <= 0) { pts.splice(i, 1); continue; }
        ctx.globalAlpha = p.l;
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (pts.length > 0) fwRef.current = requestAnimationFrame(draw);
    };
    draw();
  };

  const playSound = (pos: boolean) => {
    try {
      const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (pos) {
        const notes: [number, number][] = [[0,700],[0.08,900],[0.18,1100],[0.3,950],[0.45,1200]];
        notes.forEach(([t, f]) => {
          const o = ac.createOscillator(), g = ac.createGain();
          o.connect(g); g.connect(ac.destination);
          o.frequency.value = f; o.type = "square";
          g.gain.setValueAtTime(0.12, ac.currentTime + t);
          g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.28);
          o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.28);
        });
      } else {
        [880, 740, 600, 460].forEach((f, i) => {
          const o = ac.createOscillator(), g = ac.createGain();
          o.connect(g); g.connect(ac.destination);
          o.frequency.value = f; o.type = "sawtooth";
          g.gain.setValueAtTime(0.13, ac.currentTime + i * 0.2);
          g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + i * 0.2 + 0.38);
          o.start(ac.currentTime + i * 0.2); o.stop(ac.currentTime + i * 0.2 + 0.42);
        });
      }
    } catch (e) {}
  };

  const doSpin = () => {
    if (spinning) return;
    setSpinning(true);
    startBulbs(false);
    const winSegIdx = Math.floor(Math.random() * SEGS.length);
    const durations = [2200, 2750, 3300];
    const delays = [0, 200, 500];
    delays.forEach((delay, i) => {
      const startTop = reelTops.current[i];
      const curStripIdx = Math.round(-startTop / SEG_H) + 1;
      const spinExtraItems = (8 + Math.floor(Math.random() * 6)) * SEGS.length;
      const searchFrom = curStripIdx + spinExtraItems;
      const mod = ((searchFrom % SEGS.length) + SEGS.length) % SEGS.length;
      const diff = ((winSegIdx - mod) + SEGS.length) % SEGS.length;
      const landIdx = Math.min(searchFrom + diff, STRIP_LEN - 2);
      const targetTop = -(landIdx - 1) * SEG_H;
      animReel(i, startTop, targetTop, durations[i], delay,
        i === 2 ? () => {
          setSpinning(false);
          stopBulbs();
          const result = SEGS[centredSegIdx(reelTops.current[2])];
          if (result.positive) startBulbs(true);
          setTimeout(() => {
            setOverlay(result);
            if (result.positive) launchFW(result.color);
            playSound(result.positive);
          }, 350);
        } : undefined
      );
    });
  };

  const dismiss = () => {
    setOverlay(null);
    stopBulbs();
    if (fwRef.current) { cancelAnimationFrame(fwRef.current); fwRef.current = null; }
    if (fwCanvasRef.current) {
      const ctx = fwCanvasRef.current.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, 9999, 9999);
    }
  };

  const bulbColor = (i: number) => {
    const on = i % 2 === ((bulbTick + 1) % 2);
    if (!on) return "#2a0a3a";
    if (bulbGolden) return bulbTick % 4 < 2 ? "#F5C842" : "#BE26C1";
    return "#BE26C1";
  };
  const bulbShadow = (i: number) => {
    const on = i % 2 === ((bulbTick + 1) % 2);
    if (!on) return "none";
    if (bulbGolden) return bulbTick % 4 < 2 ? "0 0 6px #F5C842" : "0 0 6px #BE26C1";
    return "0 0 6px #BE26C1, 0 0 12px rgba(190,38,193,0.4)";
  };

  const bulbRow = (
    <div style={{ display: "flex", alignItems: "center", padding: "10px 14px 8px", gap: 3, background: "#0d0818" }}>
      {Array.from({ length: BC }).map((_, i) => (
        <div key={i} style={{ display: "contents" }}>
          {i > 0 && <div style={{ flex: 1, height: 1, background: "#2a0a3a" }} />}
          <div style={{ width: 14, height: 14, borderRadius: "50%", background: bulbColor(i), border: "1px solid #4a1060", flexShrink: 0, boxShadow: bulbShadow(i), transition: "background .15s, box-shadow .15s" }} />
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ background: "#07030f", borderRadius: 16, fontFamily: "var(--font-bruno)", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <canvas ref={fwCanvasRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20, borderRadius: 16 }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px 10px", borderBottom: "1px solid rgba(190,38,193,0.3)", background: "#0d0520" }}>
        <div style={{ width: 46, height: 46, borderRadius: "50%", background: "radial-gradient(circle, #3a0a4a, #1a0530)", border: "2px solid #BE26C1", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 12px rgba(190,38,193,0.5)", fontSize: 13, color: "#BE26C1", flexShrink: 0 }}>ME</div>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 20, letterSpacing: 4, color: "#fff", textShadow: "0 0 14px rgba(190,38,193,0.5)" }}>Quiz-It</div>
          <div style={{ fontSize: 9, letterSpacing: 2, color: "rgba(190,38,193,0.7)", marginTop: 2 }}>powered by Mac Entertainment</div>
          <div style={{ fontSize: 8, letterSpacing: 1, color: "rgba(255,255,255,0.3)" }}>by Sonya Mac</div>
        </div>
        <div style={{ width: 46 }} />
      </div>
      <div style={{ height: 2, background: "linear-gradient(90deg, transparent, #BE26C1, transparent)", animation: "glowPulse 2s ease-in-out infinite" }} />

      <div style={{ background: "#0d0818", borderLeft: "2px solid #7a107e", borderRight: "2px solid #7a107e", overflow: "hidden" }}>
        {bulbRow}
        <div style={{ textAlign: "center", padding: "14px 0 10px", fontSize: 24, letterSpacing: 8, color: "#fff", textShadow: "0 0 20px rgba(190,38,193,0.6)" }}>
          Spin <span style={{ color: "#BE26C1" }}>to</span> Win
        </div>
        <div style={{ height: 1, background: "linear-gradient(90deg, transparent, #BE26C1 50%, transparent)", margin: "0 14px" }} />

        <div style={{ background: "#08050f", padding: "14px 0 10px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "stretch" }}>
            <div style={{ width: 30, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#08050f" }}>
              <svg width="20" height="30" viewBox="0 0 20 30"><polygon points="0,0 20,15 0,30" fill="#BE26C1" /></svg>
            </div>
            <div style={{ flex: 1, display: "flex", border: "1.5px solid #4a1060", borderRadius: 8, overflow: "hidden", height: 240, position: "relative" }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-50%)", height: 80, background: "rgba(100,10,120,0.35)", borderTop: "2px solid #BE26C1", borderBottom: "2px solid #BE26C1", pointerEvents: "none", zIndex: 3 }} />
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 72, background: "linear-gradient(to bottom, #08050f, transparent)", zIndex: 4, pointerEvents: "none" }} />
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 72, background: "linear-gradient(to top, #08050f, transparent)", zIndex: 4, pointerEvents: "none" }} />
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ flex: 1, overflow: "hidden", position: "relative", borderRight: i < 2 ? "1px solid #1e0830" : "none" }}>
                  <div ref={reelRefs[i]} style={{ position: "absolute", width: "100%", top: 0, display: "flex", flexDirection: "column" }}>
                    {STRIP.map((s, j) => (
                      <div key={j} style={{ height: SEG_H, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, letterSpacing: 1, textAlign: "center", padding: "0 6px", lineHeight: 1.3, color: s.color, background: s.bg, textShadow: "0 0 10px " + s.color + "55" }}>
                        {s.label}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ width: 30, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#08050f", transform: "scaleX(-1)" }}>
              <svg width="20" height="30" viewBox="0 0 20 30"><polygon points="0,0 20,15 0,30" fill="#BE26C1" /></svg>
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: "linear-gradient(90deg, transparent, #BE26C1 50%, transparent)", margin: "10px 14px 0" }} />
        <div style={{ padding: "14px 14px 0", background: "#0d0818" }}>
          <button onClick={doSpin} disabled={spinning} style={{ width: "100%", fontFamily: "var(--font-bruno)", fontSize: 16, letterSpacing: 5, color: "#e0a0e8", background: "linear-gradient(180deg, #1e0830 0%, #0d0515 100%)", border: "1.5px solid #7a107e", borderRadius: 10, padding: 17, cursor: spinning ? "not-allowed" : "pointer", opacity: spinning ? 0.35 : 1, textShadow: "0 0 10px rgba(190,38,193,0.5)" }}>
            Spin to Win!
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", padding: "8px 14px 12px", gap: 3, background: "#0d0818" }}>
          {Array.from({ length: BC }).map((_, i) => (
            <div key={i} style={{ display: "contents" }}>
              {i > 0 && <div style={{ flex: 1, height: 1, background: "#2a0a3a" }} />}
              <div style={{ width: 14, height: 14, borderRadius: "50%", background: bulbColor(i), border: "1px solid #4a1060", flexShrink: 0, boxShadow: bulbShadow(i), transition: "background .15s, box-shadow .15s" }} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign: "center", padding: 10, fontSize: 9, letterSpacing: 2, color: "rgba(190,38,193,0.35)", borderTop: "1px solid rgba(190,38,193,0.1)", background: "#07030f" }}>
        Quiz-It powered by Mac Entertainment · by Sonya Mac
      </div>

      {overlay && (
        <div style={{ position: "absolute", inset: 0, borderRadius: 16, background: overlay.positive ? "rgba(0,8,2,0.92)" : "rgba(12,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, zIndex: 15 }}>
          <div style={{ fontSize: 12, letterSpacing: 4, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{teamName}</div>
          <div style={{ fontSize: 52, letterSpacing: 3, color: overlay.color, textAlign: "center", lineHeight: 1.1 }}>{overlay.label}</di>
          <button onClick={dismiss} style={{ marginTop: 8, fontFamily: "var(--font-bruno)", fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,0.35)", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "8px 24px", cursor: "pointer" }}>
            Continue
          </button>
        </div>
      )}

      <style>{"@keyframes glowPulse { 0%,100%{opacity:.4} 50%{opacity:1} }"}</style>
    </div>
  );
}
