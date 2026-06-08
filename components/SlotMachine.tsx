"use client";
import { useEffect, useRef, useState, useCallback } from "react";

const SEGS = [
  { label: "1st Place",  color: "#F5C842", bg: "#2a1e00", positive: true  },
  { label: "-10 Points", color: "#f87171", bg: "#2a0808", positive: false },
  { label: "2nd Place",  color: "#c8c8d8", bg: "#181828", positive: true  },
  { label: "-20 Points", color: "#fb923c", bg: "#2a1200", positive: false },
  { label: "3rd Place",  color: "#d946ef", bg: "#2a0535", positive: true  },
  { label: "-30 Points", color: "#ef4444", bg: "#2a0404", positive: false },
  { label: "+50 Points", color: "#22c55e", bg: "#042010", positive: true  },
  { label: "Last Place", color: "#dc2626", bg: "#200202", positive: false },
];

const SEG_H = 120;
const STRIP_COUNT = 20;
const STRIP: typeof SEGS = [];
for (let i = 0; i < STRIP_COUNT; i++) STRIP.push(...SEGS);
const STRIP_LEN = STRIP.length;

function centredSegIdx(topPx: number) {
  const raw = Math.round(-topPx / SEG_H) + 1;
  const clamped = ((raw % STRIP_LEN) + STRIP_LEN) % STRIP_LEN;
  return clamped % SEGS.length;
}

type Seg = typeof SEGS[0];

function OverlayPanel({ seg, teamName, onDismiss }: { seg: Seg; teamName: string; onDismiss: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: seg.positive ? "rgba(0,12,2,0.95)" : "rgba(15,0,0,0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, zIndex: 50 }}>
      <div style={{ fontSize: "clamp(16px,2vw,28px)", letterSpacing: 6, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const }}>{teamName}</div>
      <div style={{ fontSize: "clamp(60px,12vw,160px)", letterSpacing: 4, color: seg.color, textAlign: "center", lineHeight: 1, fontWeight: 700 }}>{seg.label}</div>
      <button onClick={onDismiss} style={{ marginTop: 16, fontSize: "clamp(12px,1.5vw,20px)", letterSpacing: 4, color: "rgba(255,255,255,0.4)", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "12px 36px", cursor: "pointer" }}>
        Continue
      </button>
    </div>
  );
}

export default function SlotMachine() {
  const [teamName, setTeamName] = useState("");
  const [victorySong, setVictorySong] = useState("");
  const r0 = useRef<HTMLDivElement>(null);
  const r1 = useRef<HTMLDivElement>(null);
  const r2 = useRef<HTMLDivElement>(null);
  const reelRefs = [r0, r1, r2];
  const reelTops = useRef([0, 0, 0]);
  const [spinning, setSpinning] = useState(false);
  const [overlay, setOverlay] = useState<Seg | null>(null);
  const bulbRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [bulbTick, setBulbTick] = useState(0);
  const [bulbGolden, setBulbGolden] = useState(false);
  const fwRef = useRef<number | null>(null);
  const fwCanvasRef = useRef<HTMLCanvasElement>(null);
  const crowdRef = useRef<HTMLAudioElement | null>(null);
  const spinSoundRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    bulbRef.current = setInterval(() => { t++; setBulbTick(t); }, golden ? 120 : 250);
  }, [stopBulbs]);

  useEffect(() => () => { stopBulbs(); }, [stopBulbs]);

  const startSpinSound = () => {
    try {
      const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
      spinSoundRef.current = setInterval(() => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = "square";
        o.frequency.value = 600 + Math.random() * 600;
        g.gain.setValueAtTime(0.05, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.05);
        o.start(ac.currentTime);
        o.stop(ac.currentTime + 0.05);
      }, 55);
    } catch {}
  };

  const stopSpinSound = () => {
    if (spinSoundRef.current) { clearInterval(spinSoundRef.current); spinSoundRef.current = null; }
  };

  const animReel = (reelIdx: number, fromTop: number, toTop: number, dur: number, delay: number, cb?: () => void) => {
    let t0: number | null = null;
    setTimeout(() => {
      const step = (ts: number) => {
        if (!t0) t0 = ts;
        const p = Math.min((ts - t0) / dur, 1);
        const e = 1 - Math.pow(1 - p, 4);
        const cur = fromTop + (toTop - fromTop) * e;
        reelTops.current[reelIdx] = cur;
        const el = reelRefs[reelIdx].current;
        if (el) el.style.top = cur + "px";
        if (p < 1) requestAnimationFrame(step);
        else {
          reelTops.current[reelIdx] = toTop;
          if (el) el.style.top = toTop + "px";
          if (cb) cb();
        }
      };
      requestAnimationFrame(step);
    }, delay);
  };

  const launchFW = (col: string) => {
    const cv = fwCanvasRef.current;
    if (!cv) return;
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const pts: { x: number; y: number; vx: number; vy: number; c: string; l: number; d: number }[] = [];
    const cols = [col, "#BE26C1", "#F5C842", "#fff", "#22c55e", "#c8c8d8"];
    for (let b = 0; b < 16; b++) {
      setTimeout(() => {
        const cx = 80 + Math.random() * (cv.width - 160);
        const cy = 60 + Math.random() * (cv.height * 0.5);
        for (let p = 0; p < 50; p++) {
          const a = (p / 50) * Math.PI * 2;
          const spd = 3 + Math.random() * 8;
          pts.push({ x: cx, y: cy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, c: cols[Math.floor(Math.random() * cols.length)], l: 1, d: 0.008 + Math.random() * 0.014 });
        }
      }, b * 180);
    }
    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.09; p.vx *= 0.98; p.vy *= 0.98; p.l -= p.d;
        if (p.l <= 0) { pts.splice(i, 1); continue; }
        ctx.globalAlpha = p.l;
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (pts.length > 0) fwRef.current = requestAnimationFrame(draw);
    };
    draw();
  };

  const playPositiveSounds = (songFile: string) => {
    try {
      const horn = new Audio("/sounds/airhorn.mp3");
      horn.volume = 1.0;
      horn.play().catch(() => {});
      const crowd = new Audio("/sounds/crowd-cheer.mp3");
      crowd.volume = 0.9;
      crowdRef.current = crowd;
      crowd.play().catch(() => {});
      if (songFile) {
        const song = new Audio("/sounds/" + songFile);
        song.volume = 0.85;
        song.play().catch(() => {});
      }
      setTimeout(() => {
        if (crowdRef.current) {
          const fadeInterval = setInterval(() => {
            if (crowdRef.current && crowdRef.current.volume > 0.05) {
              crowdRef.current.volume = Math.max(0, crowdRef.current.volume - 0.05);
            } else {
              if (crowdRef.current) crowdRef.current.pause();
              clearInterval(fadeInterval);
            }
          }, 200);
        }
      }, 4000);
    } catch {}
  };

  const playNegativeSounds = () => {
    try {
      const trombone = new Audio("/sounds/sad-trombone.mp3");
      trombone.volume = 0.9;
      trombone.play().catch(() => {});
    } catch {}
  };

  const doSpin = () => {
    if (spinning) return;
    setSpinning(true);
    startBulbs(false);
    startSpinSound();

    const winSegIdx = Math.floor(Math.random() * SEGS.length);

    const durations = [2800, 3400, 4200];
    const delays = [0, 300, 700];

    delays.forEach((delay, i) => {
      const startTop = reelTops.current[i];
      // How many full strip cycles to spin (ensures always forward motion)
      const fullCycles = 8 + Math.floor(Math.random() * 6);
      // Land on an occurrence of winSegIdx in the upper half of the strip
      // Pick a target strip index that is: fullCycles*SEGS.length ahead, aligned to winSegIdx
      const baseIdx = fullCycles * SEGS.length + winSegIdx;
      // Clamp to safe range
      const landStripIdx = Math.min(baseIdx, STRIP_LEN - 3);
      const targetTop = -(landStripIdx) * SEG_H;

      animReel(i, startTop, targetTop, durations[i], delay,
        i === 2 ? () => {
          setSpinning(false);
          stopBulbs();
          stopSpinSound();
          const actualResult = SEGS[winSegIdx];
          if (actualResult.positive) startBulbs(true);
          setTimeout(() => {
            setOverlay(actualResult);
            if (actualResult.positive) {
              launchFW(actualResult.color);
              playPositiveSounds(victorySong);
            } else {
              playNegativeSounds();
            }
            resetReels();
          }, 500);
        } : undefined
      );
    });
  };

  const resetReels = () => {
    const mid = Math.floor(STRIP_LEN / 4);
    const top = -(mid - 1) * SEG_H;
    reelTops.current = [top, top, top];
    reelRefs.forEach((r) => {
      if (r.current) r.current.style.top = top + "px";
    });
  };

  const dismiss = () => {
    setOverlay(null);
    stopBulbs();
    if (fwRef.current) { cancelAnimationFrame(fwRef.current); fwRef.current = null; }
    if (crowdRef.current) { crowdRef.current.pause(); crowdRef.current = null; }
    if (fwCanvasRef.current) {
      const ctx = fwCanvasRef.current.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, 9999, 9999);
    }
    resetReels();
  };

  const BC = 20;
  const bulbColor = (i: number) => {
    const on = i % 2 === ((bulbTick + 1) % 2);
    if (!on) return "#2a0a3a";
    if (bulbGolden) return bulbTick % 4 < 2 ? "#F5C842" : "#BE26C1";
    return "#BE26C1";
  };
  const bulbShadow = (i: number) => {
    const on = i % 2 === ((bulbTick + 1) % 2);
    if (!on) return "none";
    if (bulbGolden) return bulbTick % 4 < 2 ? "0 0 8px #F5C842" : "0 0 8px #BE26C1";
    return "0 0 8px #BE26C1";
  };

  const BulbRow = ({ bottom }: { bottom?: boolean }) => (
    <div style={{ display: "flex", alignItems: "center", padding: bottom ? "10px 20px 14px" : "14px 20px 10px", gap: 4, background: "#0d0818" }}>
      {Array.from({ length: BC }).map((_, i) => (
        <div key={i} style={{ display: "contents" }}>
          {i > 0 && <div style={{ flex: 1, height: 1, background: "#2a0a3a" }} />}
          <div style={{ width: 16, height: 16, borderRadius: "50%", background: bulbColor(i), border: "1px solid #4a1060", flexShrink: 0, boxShadow: bulbShadow(i), transition: "background .15s, box-shadow .15s" }} />
        </div>
      ))}
    </div>
  );

  const REEL_H = 360;

  return (
    <div style={{ background: "#07030f", position: "fixed", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <canvas ref={fwCanvasRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 40 }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 24px 8px", borderBottom: "1px solid rgba(190,38,193,0.3)", background: "#0d0520", flexShrink: 0 }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "radial-gradient(circle, #3a0a4a, #1a0530)", border: "2px solid #BE26C1", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 14px rgba(190,38,193,0.6)", fontSize: 14, color: "#BE26C1", flexShrink: 0, fontWeight: 700 }}>ME</div>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: "clamp(18px,2.5vw,32px)", letterSpacing: 6, color: "#fff", textShadow: "0 0 16px rgba(190,38,193,0.6)" }}>Quiz-It</div>
          <div style={{ fontSize: "clamp(8px,1vw,13px)", letterSpacing: 3, color: "rgba(190,38,193,0.8)", marginTop: 2 }}>powered by Mac Entertainment</div>
          <div style={{ fontSize: "clamp(7px,0.8vw,11px)", letterSpacing: 2, color: "rgba(255,255,255,0.3)" }}>by Sonya Mac</div>
        </div>
        <div style={{ width: 52 }} />
      </div>
      <div style={{ height: 2, background: "linear-gradient(90deg, transparent, #BE26C1, transparent)", animation: "glowPulse 2s ease-in-out infinite", flexShrink: 0 }} />

      <div style={{ display: "flex", gap: 12, padding: "10px 24px 8px", background: "#0d0520", flexShrink: 0, borderBottom: "1px solid rgba(190,38,193,0.2)" }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 10, letterSpacing: 3, color: "rgba(190,38,193,0.6)", display: "block", marginBottom: 6 }}>Team Name</label>
          <input value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="Enter team name..." style={{ padding: "10px 16px", borderRadius: 10, background: "#0f0f1a", color: "#fff", border: "1px solid rgba(190,38,193,0.4)", fontSize: 15, width: "100%", outline: "none" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 10, letterSpacing: 3, color: "rgba(190,38,193,0.6)", display: "block", marginBottom: 6 }}>Victory Song</label>
          <input value={victorySong} onChange={e => setVictorySong(e.target.value)} placeholder="Song filename e.g. song.mp3" style={{ padding: "10px 16px", borderRadius: 10, background: "#0f0f1a", color: "#fff", border: "1px solid rgba(190,38,193,0.4)", fontSize: 15, width: "100%", outline: "none" }} />
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0d0818", borderLeft: "2px solid #7a107e", borderRight: "2px solid #7a107e", overflow: "hidden" }}>
        <BulbRow />
        <div style={{ textAlign: "center", padding: "10px 0 8px", fontSize: "clamp(24px,4vw,56px)", letterSpacing: 10, color: "#fff", textShadow: "0 0 24px rgba(190,38,193,0.7)", flexShrink: 0 }}>
          Spin <span style={{ color: "#BE26C1" }}>to</span> Win
        </div>
        <div style={{ height: 1, background: "linear-gradient(90deg, transparent, #BE26C1 50%, transparent)", margin: "0 20px", flexShrink: 0 }} />

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 24px", gap: 16, background: "#08050f" }}>
          <div style={{ flexShrink: 0 }}>
            <svg width="28" height="48" viewBox="0 0 28 48"><polygon points="0,0 28,24 0,48" fill="#BE26C1" /></svg>
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ flex: 1, height: REEL_H, overflow: "hidden", position: "relative", border: "2px solid #4a1060", borderRadius: 12, background: "#06040f", boxShadow: "0 0 20px rgba(190,38,193,0.15), inset 0 0 30px rgba(0,0,0,0.5)" }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-50%)", height: SEG_H, background: "rgba(100,10,120,0.3)", borderTop: "2px solid #BE26C1", borderBottom: "2px solid #BE26C1", pointerEvents: "none", zIndex: 3 }} />
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 100, background: "linear-gradient(to bottom, #06040f, transparent)", zIndex: 4, pointerEvents: "none" }} />
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 100, background: "linear-gradient(to top, #06040f, transparent)", zIndex: 4, pointerEvents: "none" }} />
              <div ref={reelRefs[i]} style={{ position: "absolute", width: "100%", top: 0, display: "flex", flexDirection: "column" }}>
                {STRIP.map((s, j) => (
                  <div key={j} style={{ height: SEG_H, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "clamp(14px,2vw,26px)", letterSpacing: 2, textAlign: "center", padding: "0 12px", lineHeight: 1.2, color: s.color, background: s.bg, fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    {s.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ flexShrink: 0, transform: "scaleX(-1)" }}>
            <svg width="28" height="48" viewBox="0 0 28 48"><polygon points="0,0 28,24 0,48" fill="#BE26C1" /></svg>
          </div>
        </div>

        <div style={{ height: 1, background: "linear-gradient(90deg, transparent, #BE26C1 50%, transparent)", margin: "0 20px", flexShrink: 0 }} />
        <div style={{ padding: "14px 24px 0", background: "#0d0818", flexShrink: 0 }}>
          <button onClick={doSpin} disabled={spinning} style={{ width: "100%", fontSize: "clamp(16px,2vw,26px)", letterSpacing: 6, color: "#e0a0e8", background: "linear-gradient(180deg, #1e0830 0%, #0d0515 100%)", border: "1.5px solid #7a107e", borderRadius: 12, padding: "18px 0", cursor: spinning ? "not-allowed" : "pointer", opacity: spinning ? 0.35 : 1 }}>
            Spin to Win!
          </button>
        </div>
        <BulbRow bottom />
      </div>

      <div style={{ textAlign: "center", padding: "8px", fontSize: "clamp(8px,0.8vw,11px)", letterSpacing: 2, color: "rgba(190,38,193,0.3)", borderTop: "1px solid rgba(190,38,193,0.1)", background: "#07030f", flexShrink: 0 }}>
        Quiz-It powered by Mac Entertainment by Sonya Mac
      </div>

      {overlay && <OverlayPanel seg={overlay} teamName={teamName || "Team"} onDismiss={dismiss} />}
      <style>{"@keyframes glowPulse { 0%,100%{opacity:.4} 50%{opacity:1} }"}</style>
    </div>
  );
}
