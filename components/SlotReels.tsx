"use client";
import { useEffect, useRef, useState } from "react";

export const SLOT_SEGS = [
  { label: "1st Place",  color: "#1a1200", bg: "#F5C842", positive: true  },
  { label: "-10 Points", color: "#ffffff", bg: "#DC2626", positive: false },
  { label: "2nd Place",  color: "#1a1a2e", bg: "#A8B4D8", positive: true  },
  { label: "-20 Points", color: "#1a0e00", bg: "#FB923C", positive: false },
  { label: "3rd Place",  color: "#2a0535", bg: "#E879F9", positive: true  },
  { label: "-30 Points", color: "#ffffff", bg: "#B91C1C", positive: false },
  { label: "+50 Points", color: "#042010", bg: "#4ADE80", positive: true  },
  { label: "Last Place", color: "#ffffff", bg: "#991B1B", positive: false },
];

const SEG_H = 120;
const STRIP_COUNT = 20;
const STRIP: typeof SLOT_SEGS = [];
for (let i = 0; i < STRIP_COUNT; i++) STRIP.push(...SLOT_SEGS);
const STRIP_LEN = STRIP.length;

type Seg = typeof SLOT_SEGS[0];

type SlotReelsProps = {
  targetIdx: number | null;
  teamName: string;
  victorySong?: string;
  size?: "full" | "compact";
  // Unique per-spin identity (e.g. a timestamp). Without this, two different spins
  // landing on the same segment by coincidence (1-in-8 odds each time) would look
  // identical to this component, so the second spin would silently never trigger -
  // leaving that screen stuck showing the previous spin's stale result while other
  // screens correctly animate and announce the new one.
  spinNonce?: number | string | null;
  /** Only the display screen (TV) should play audio. Pass false on host and handset. */
  audioEnabled?: boolean;
};

export function SlotReels({ targetIdx, teamName, victorySong, size = "full", spinNonce, audioEnabled = true }: SlotReelsProps) {
  const r0 = useRef<HTMLDivElement>(null);
  const r1 = useRef<HTMLDivElement>(null);
  const r2 = useRef<HTMLDivElement>(null);
  const reelRefs = [r0, r1, r2];
  const reelTops = useRef([0, 0, 0]);
  const [spinning, setSpinning] = useState(false);
  const [overlay, setOverlay] = useState<Seg | null>(null);
  const [bulbTick, setBulbTick] = useState(0);
  const [bulbGolden, setBulbGolden] = useState(false);
  const bulbRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fwCanvasRef = useRef<HTMLCanvasElement>(null);
  const crowdRef = useRef<HTMLAudioElement | null>(null);
  const spinAudioElRef = useRef<HTMLAudioElement | null>(null);
  const lastHandledTarget = useRef<number | string | null>(null);

  const INITIAL_CENTRE = Math.floor(STRIP_LEN / 2);
  const INITIAL_TOP = -(INITIAL_CENTRE - 1) * SEG_H;

  useEffect(() => {
    reelTops.current = [INITIAL_TOP, INITIAL_TOP, INITIAL_TOP];
    reelRefs.forEach((r) => { if (r.current) r.current.style.top = INITIAL_TOP + "px"; });
  }, []);

  const stopBulbs = () => {
    if (bulbRef.current) clearInterval(bulbRef.current);
    bulbRef.current = null;
    setBulbTick(-99);
    setBulbGolden(false);
  };
  const startBulbs = (golden: boolean) => {
    stopBulbs();
    setBulbGolden(golden);
    let t = 0;
    bulbRef.current = setInterval(() => { t++; setBulbTick(t); }, golden ? 120 : 250);
  };
  useEffect(() => () => { stopBulbs(); }, []);

  const startSpinSound = () => {
    if (!audioEnabled) return;
    try {
      const audio = new Audio("/sounds/slot-spin.mp3");
      audio.loop = true;
      audio.volume = 0.6;
      audio.play().catch(() => {});
      spinAudioElRef.current = audio;
    } catch {}
  };
  const stopSpinSound = () => {
    if (spinAudioElRef.current) {
      spinAudioElRef.current.pause();
      spinAudioElRef.current.currentTime = 0;
      spinAudioElRef.current = null;
    }
  };

  const animReel = (reelIdx: number, fromTop: number, toTop: number, dur: number, delay: number, easePow: number, cb?: () => void) => {
    let t0: number | null = null;
    setTimeout(() => {
      const step = (ts: number) => {
        if (!t0) t0 = ts;
        const p = Math.min((ts - t0) / dur, 1);
        const e = 1 - Math.pow(1 - p, easePow);
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

  const launchFW = () => {
    const cv = document.createElement("canvas");
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    cv.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:60";
    document.body.appendChild(cv);
    const ctx = cv.getContext("2d");
    if (!ctx) { document.body.removeChild(cv); return; }
    const pts: { x: number; y: number; vx: number; vy: number; c: string; l: number; d: number; r: number }[] = [];
    const cols = ["#BE26C1", "#F5C842", "#ffffff", "#22c55e", "#c8c8d8", "#ff6b6b", "#ffd700", "#00cfff", "#ff69b4", "#ff4500"];
    const burst = (cx: number, cy: number) => {
      for (let p = 0; p < 80; p++) {
        const a = (p / 80) * Math.PI * 2;
        const spd = 4 + Math.random() * 12;
        pts.push({ x: cx, y: cy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 2, c: cols[Math.floor(Math.random() * cols.length)], l: 1, d: 0.006 + Math.random() * 0.01, r: 3 + Math.random() * 5 });
      }
    };
    for (let b = 0; b < 20; b++) {
      setTimeout(() => {
        const cx = 100 + Math.random() * (cv.width - 200);
        const cy = 50 + Math.random() * (cv.height * 0.6);
        burst(cx, cy);
      }, b * 200);
    }
    let rafId: number;
    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.vx *= 0.97; p.vy *= 0.97; p.l -= p.d;
        if (p.l <= 0) { pts.splice(i, 1); continue; }
        ctx.globalAlpha = p.l;
        ctx.fillStyle = p.c;
        ctx.shadowColor = p.c;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    setTimeout(() => { cancelAnimationFrame(rafId); if (cv.parentNode) document.body.removeChild(cv); }, 8000);
  };

  const playPositiveSounds = (songFile?: string) => {
    if (!audioEnabled) return;
    try {
      const horn = new Audio("/sounds/airhorn.mp3");
      horn.volume = 1.0;
      horn.play().catch(() => {});
      const crowd = new Audio("/sounds/crowd-cheer.mp3");
      crowd.volume = 0.9;
      crowdRef.current = crowd;
      crowd.play().catch(() => {});
      if (songFile) {
        const song = new Audio("/sounds/" + encodeURIComponent(songFile));
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
    // Intentionally no audio. Spin to Win must NOT play the sad-trombone /
    // question "wrong answer" sound on a penalty outcome - that shared clip
    // read as normal-question incorrect-answer feedback and was the "stray sad
    // trombone" reported after a spin resolved. The penalty is conveyed by the
    // reel result overlay and bulbs; no question-reveal audio is triggered here.
    return;
  };

  // Seeded pseudo-random number generator (mulberry32).
  // Seeded with spinNonce — the same value on every screen — so host,
  // display and handset all generate identical animation paths.
  const makeRng = (seed: number | string | null | undefined): (() => number) => {
    let s = (typeof seed === "number" ? seed :
             typeof seed === "string" ? seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0) :
             12345) >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const pickDifferent = (exclude: number, rng: () => number) => {
    let idx: number;
    do { idx = Math.floor(rng() * SLOT_SEGS.length); } while (idx === exclude);
    return idx;
  };
  const landReelOn = (segIdx: number, rng: () => number, reelH: number) => {
    const fullCycles = 8 + Math.floor(rng() * 4);
    const baseIdx = fullCycles * SLOT_SEGS.length + segIdx;
    const landStripIdx = Math.min(baseIdx, STRIP_LEN - 3);
    // Correct alignment formula:
    // Centre of segment n = n × SEG_H + toTop + SEG_H/2 = reelH/2
    // → toTop = (reelH − SEG_H) / 2 − n × SEG_H
    return (reelH - SEG_H) / 2 - landStripIdx * SEG_H;
  };
  const resetReels = () => {
    const mid = Math.floor(STRIP_LEN / 4);
    const top = -(mid - 1) * SEG_H;
    reelTops.current = [top, top, top];
    reelRefs.forEach((r) => { if (r.current) r.current.style.top = top + "px"; });
  };

  useEffect(() => {
    if (targetIdx === null || targetIdx === undefined) return;
    const spinKey = spinNonce ?? targetIdx;
    if (lastHandledTarget.current === spinKey) return;
    lastHandledTarget.current = spinKey;

    setOverlay(null);
    setSpinning(true);
    startBulbs(false);
    startSpinSound();

    const winSegIdx = targetIdx;
    // One seeded RNG per spin, shared across all calls below.
    // spinNonce is identical on every screen so rng() produces the same
    // sequence everywhere — identical rebel reel, decoy, cycles, positions.
    const rng = makeRng(spinNonce);
    const rebelReel = Math.floor(rng() * 3);
    const rebelIdx = pickDifferent(winSegIdx, rng);
    const results = [winSegIdx, winSegIdx, winSegIdx];
    results[rebelReel] = rebelIdx;

    const durations = [2800, 4000, 6800];
    const delays = [0, 600, 1400];
    const easePowers = [4, 4, 2];

    [0, 1, 2].forEach((i) => {
      const startTop = reelTops.current[i];
      const targetTop = landReelOn(results[i], rng, REEL_H);
      animReel(i, startTop, targetTop, durations[i], delays[i], easePowers[i],
        i === 2 ? () => {
          stopSpinSound();
          setTimeout(() => {
            const rebelStart = reelTops.current[rebelReel];
            const rebelTarget = landReelOn(winSegIdx, rng, REEL_H);
            animReel(rebelReel, rebelStart, rebelTarget, 2000, 0, 2, () => {
              setSpinning(false);
              stopBulbs();
              const actualResult = SLOT_SEGS[winSegIdx];
              if (actualResult.positive) startBulbs(true);
              setTimeout(() => {
                setOverlay(actualResult);
                if (actualResult.positive) {
                  setTimeout(() => { launchFW(); }, 150);
                  playPositiveSounds(victorySong);
                } else {
                  playNegativeSounds();
                }
                resetReels();
              }, 0);
            });
          }, 1200);
        } : undefined
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIdx, spinNonce]);

  const BC = size === "compact" ? 10 : 20;
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
    <div style={{ display: "flex", alignItems: "center", padding: bottom ? "8px 16px 10px" : "10px 16px 8px", gap: 4, background: "#0d0818" }}>
      {Array.from({ length: BC }).map((_, i) => (
        <div key={i} style={{ display: "contents" }}>
          {i > 0 && <div style={{ flex: 1, height: 1, background: "#2a0a3a" }} />}
          <div style={{ width: size === "compact" ? 10 : 16, height: size === "compact" ? 10 : 16, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.85), ${bulbColor(i)} 55%, ${bulbColor(i)} 100%)`, border: "1px solid rgba(180,185,200,0.4)", flexShrink: 0, boxShadow: `${bulbShadow(i)}, inset 0 1px 1px rgba(255,255,255,0.35), inset 0 -1px 2px rgba(0,0,0,0.5)`, transition: "background .15s, box-shadow .15s" }} />
        </div>
      ))}
    </div>
  );

  const REEL_H = size === "compact" ? 160 : 480;

  return (
    <div style={{
      position: "relative", width: "100%", borderRadius: 26,
      background: "linear-gradient(145deg, #2E1A52 0%, #231543 8%, #1D1140 20%, #150A2E 34%, #0A0118 55%)",
      padding: size === "compact" ? 6 : 10,
      boxShadow: "0 24px 70px rgba(0,0,0,0.75), 0 0 0 1px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.35), inset 0 -2px 6px rgba(0,0,0,0.5)",
    }}>
      {/* Illuminated cabinet border - static purple glow ring, purely decorative */}
      <div style={{ position: "absolute", inset: -4, borderRadius: 30, boxShadow: "0 0 18px 2px rgba(190,38,193,0.4), 0 0 40px 6px rgba(190,38,193,0.22), 0 0 70px 14px rgba(190,38,193,0.08)", pointerEvents: "none" as const }} />

      {/* Gold trim accent - thin edge highlight only, cabinet body stays graphite/chrome/black */}
      <div style={{ position: "absolute", inset: 0, borderRadius: 26, border: "1px solid rgba(212,175,90,0.55)", pointerEvents: "none" as const }} />

      {/* Cabinet header plate - Quiz-It branding only */}
      <div style={{ textAlign: "center", marginBottom: size === "compact" ? 6 : 10 }}>
        <div style={{ display: "inline-block", padding: size === "compact" ? "4px 16px" : "6px 24px", borderRadius: 999, background: "linear-gradient(180deg, #180429, #0a0116)", border: "1px solid rgba(212,175,90,0.55)", boxShadow: "0 3px 10px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)" }}>
          <span style={{ fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", fontSize: size === "compact" ? 12 : 16, letterSpacing: ".05em" }}>
            <span style={{ color: "#BE26C1" }}>QUIZ-</span><span style={{ color: "#ffffff" }}>IT</span>
          </span>
        </div>
      </div>

      {/* Inner cabinet panel - unchanged content below, only this wrapper's own border/shadow enriched */}
      <div style={{ background: "#07030f", borderRadius: 18, border: "1px solid rgba(0,0,0,0.6)", overflow: "hidden", position: "relative", width: "100%", boxShadow: "inset 0 3px 16px rgba(0,0,0,0.85), inset 0 0 1px rgba(255,255,255,0.05)" }}>
      <canvas ref={fwCanvasRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 60 }} />
      <BulbRow />
      <div style={{ textAlign: "center", fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", padding: size === "compact" ? "6px 0 4px" : "10px 0 8px", fontSize: size === "compact" ? "clamp(14px,3vw,22px)" : "clamp(22px,3.6vw,50px)", letterSpacing: size === "compact" ? ".12em" : ".14em", color: "#fff", textShadow: "0 0 24px rgba(190,38,193,0.7)" }}>
        <span style={{ color: "#BE26C1" }}>SPIN</span> TO WIN
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: size === "compact" ? "8px 12px" : "16px 24px", gap: size === "compact" ? 8 : 16, background: "#08050f", boxShadow: "inset 0 4px 14px rgba(0,0,0,0.6), inset 0 -4px 14px rgba(0,0,0,0.5)" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ flex: 1, height: REEL_H, overflow: "hidden", position: "relative", border: "1px solid rgba(10,4,20,0.9)", borderRadius: 12, background: "#06040f", boxShadow: "inset 0 3px 10px rgba(5,0,13,0.85), inset 0 -3px 10px rgba(5,0,13,0.7), inset 0 0 0 2px rgba(140,120,185,0.3), 0 3px 10px rgba(5,0,13,0.6), 0 0 0 1px rgba(212,175,90,0.25)" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-50%)", height: SEG_H, background: "rgba(100,10,120,0.3)", borderTop: "2px solid #BE26C1", borderBottom: "2px solid #BE26C1", pointerEvents: "none", zIndex: 3 }} />
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 60, background: "linear-gradient(to bottom, #06040f, transparent)", zIndex: 4, pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(to top, #06040f, transparent)", zIndex: 4, pointerEvents: "none" }} />
            <div ref={reelRefs[i]} style={{ position: "absolute", width: "100%", top: 0, display: "flex", flexDirection: "column" }}>
              {STRIP.map((s, j) => (
                <div key={j} style={{ height: SEG_H, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size === "compact" ? "clamp(10px,1.5vw,16px)" : "clamp(18px,2.6vw,34px)", letterSpacing: 2, textAlign: "center", padding: "0 8px", lineHeight: 1.2, color: s.color, background: s.bg, fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  {s.label}
                </div>
              ))}
            </div>
            {/* Glass covering - very subtle tempered-glass reflection, purely decorative, non-interactive */}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.01) 25%, transparent 50%, rgba(255,255,255,0.02) 75%, transparent 100%)", pointerEvents: "none" as const, zIndex: 5 }} />
          </div>
        ))}
      </div>
      <BulbRow bottom />

      {overlay && (
        <div style={{ position: "fixed", inset: 0, background: overlay.positive ? "radial-gradient(circle at 50% 45%, #0c1912 0%, #030805 75%)" : "radial-gradient(circle at 50% 45%, #1c0808 0%, #060202 75%)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "clamp(32px,6vw,64px) clamp(40px,8vw,96px)", borderRadius: 28, background: "linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015))", border: `1px solid ${overlay.bg}55`, boxShadow: `0 30px 80px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.08), inset 0 -1px 12px rgba(0,0,0,0.4), 0 0 60px ${overlay.bg}22`, maxWidth: "90vw" }}>
            <div style={{ fontSize: "clamp(28px,4.5vw,52px)", letterSpacing: 5, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" as const, fontWeight: 600 }}>{teamName}</div>
            <div style={{ width: 64, height: 2, borderRadius: 2, background: `${overlay.bg}88` }} />
            <div style={{ fontSize: "clamp(52px,11vw,168px)", letterSpacing: 3, color: overlay.bg, textAlign: "center", lineHeight: 1, fontWeight: 800, textShadow: `0 0 30px ${overlay.bg}99, 0 2px 4px rgba(0,0,0,0.4)` }}>{overlay.label}</div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}