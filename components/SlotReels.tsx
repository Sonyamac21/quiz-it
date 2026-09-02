"use client";
import { useEffect, useRef, useState } from "react";
import { playShowAudio, stopShowAudio, victorySongAudioFile } from "@/lib/audio/showAudio";

// Recoloured to the same jewel-tone, purple-led palette as the Hard Deck
// wheel (components/SpinWheel.tsx) - deep purples/magenta for the wins,
// muted wine reds for the losses - instead of the old carnival mix of
// bright gold/orange/red/silver. Win vs. loss still reads instantly (warm
// magenta/green glow vs. dark red), it just no longer clashes with the rest
// of the show's colour language.
export const SLOT_SEGS = [
  { label: "1st Place",  color: "#fff",    bg: "#D94FDC", positive: true  },
  { label: "-10 Points", color: "#ffe3e6", bg: "#7A1B2E", positive: false },
  { label: "2nd Place",  color: "#fff",    bg: "#8A1B8D", positive: true  },
  { label: "-20 Points", color: "#ffe3e6", bg: "#5C1522", positive: false },
  { label: "3rd Place",  color: "#fff",    bg: "#6B2F9E", positive: true  },
  { label: "-30 Points", color: "#ffe3e6", bg: "#7A1B2E", positive: false },
  { label: "+50 Points", color: "#04150a", bg: "#4ADE80", positive: true  },
  { label: "Last Place", color: "#ffe3e6", bg: "#5C1522", positive: false },
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
  const [overlay, setOverlay] = useState<Seg | null>(null);
  const fwCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastHandledTarget = useRef<number | string | null>(null);

  const INITIAL_CENTRE = Math.floor(STRIP_LEN / 2);
  const INITIAL_TOP = -(INITIAL_CENTRE - 1) * SEG_H;
  // The full-size machine used to be a fixed 480px tall regardless of the
  // viewport, while its OUTER wrapper (.qi-display-spin-machine in
  // globals.css) was capped to fit within the display's available height.
  // A first attempt tried to GUESS a smaller fixed height from a percentage
  // of window.innerHeight, but that guess didn't account for the cabinet's
  // own chrome (header plate, title, bulb rows) eating into the same box,
  // so it was still too tall and got clipped/scrolled off-screen. This
  // measures the ACTUAL rendered height of the reel row itself via
  // ResizeObserver - whatever space is genuinely left after every other
  // cabinet element has taken its share - so the strip math always matches
  // reality exactly, no matter how the surrounding chrome changes later.
  const reelRowRef = useRef<HTMLDivElement>(null);
  const [reelH, setReelH] = useState(() => size === "compact" ? 160 : 380);
  useEffect(() => {
    if (size === "compact" || !reelRowRef.current) return;
    const el = reelRowRef.current;
    const measure = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 40) setReelH(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);
  const REEL_H = reelH;

  useEffect(() => {
    reelTops.current = [INITIAL_TOP, INITIAL_TOP, INITIAL_TOP];
    reelRefs.forEach((r) => { if (r.current) r.current.style.top = INITIAL_TOP + "px"; });
  }, []);

  const startSpinSound = () => {
    if (!audioEnabled) return;
    playShowAudio("slot-spin.mp3", { channel: "spin", loop: true });
  };
  const stopSpinSound = () => {
    if (audioEnabled) stopShowAudio("spin");
  };
  useEffect(() => () => {
    if (audioEnabled) stopShowAudio("spin");
  }, [audioEnabled]);

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
    playShowAudio("airhorn.mp3", { channel: "cue", volume: 0.65 });
    if (songFile) playShowAudio(victorySongAudioFile(songFile), { channel: "music" });
  };
  const playNegativeSounds = () => {
    // Negative Spin-to-Win outcome: one sad-trombone. This fires ONLY from the
    // reel-landing callback for a non-positive segment (never on question reveal),
    // and only when audioEnabled (Display only), so it can't be mistaken for the
    // normal-question "wrong answer" sound. Deduped by the effect's
    // lastHandledTarget/spinNonce guard, exactly like playPositiveSounds — plays
    // once per spin, no overlap with any result sting.
    if (!audioEnabled) return;
    playShowAudio("sad-trombone.mp3", { channel: "cue", volume: 0.7 });
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
              const actualResult = SLOT_SEGS[winSegIdx];
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

  // Cabinet chrome upgraded to match the Hard Deck wheel's approved look:
  // dark rounded card, ambient purple glow, glass highlight sweep, no gold
  // trim or marquee bulb rows. The reels/spin mechanic below is untouched -
  // this is a colour/material pass only, not a redesign of the slot
  // machine itself.
  return (
    <div style={{
      position: "relative", width: "100%", borderRadius: 32,
      background: "linear-gradient(160deg, #1D1140, #12081F)",
      padding: size === "compact" ? 10 : 18,
      boxShadow: "0 30px 60px rgba(0,0,0,0.55), 0 0 90px rgba(190,38,193,0.14), inset 0 1px 0 rgba(255,255,255,0.06)",
    }}>
      {/* Cabinet header plate - Quiz-It branding only */}
      <div style={{ textAlign: "center", marginBottom: size === "compact" ? 8 : 14 }}>
        <div style={{ display: "inline-block", padding: size === "compact" ? "4px 16px" : "6px 24px", borderRadius: 999, background: "rgba(217,79,220,0.08)", border: "1px solid rgba(217,79,220,0.35)" }}>
          <span style={{ fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", fontSize: size === "compact" ? 12 : 16, letterSpacing: ".05em" }}>
            <span style={{ color: "#BE26C1" }}>QUIZ-</span><span style={{ color: "#ffffff" }}>IT</span>
          </span>
        </div>
      </div>

      {/* Inner cabinet panel */}
      <div style={{ background: "#0D0618", borderRadius: 20, overflow: "hidden", position: "relative", width: "100%", boxShadow: "inset 0 2px 0 rgba(255,255,255,0.03), inset 0 12px 24px rgba(0,0,0,0.6), inset 0 -12px 24px rgba(0,0,0,0.6)", display: size === "compact" ? undefined : "flex", flexDirection: size === "compact" ? undefined : "column", flex: size === "compact" ? undefined : "1 1 0", minHeight: size === "compact" ? undefined : 0 }}>
      <canvas ref={fwCanvasRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 60 }} />
      <div style={{ textAlign: "center", fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", padding: size === "compact" ? "10px 0 4px" : "16px 0 8px", fontSize: size === "compact" ? "clamp(14px,3vw,22px)" : "clamp(22px,3.6vw,50px)", letterSpacing: size === "compact" ? ".12em" : ".14em", color: "#fff", textShadow: "0 0 24px rgba(190,38,193,0.7)" }}>
        <span style={{ color: "#BE26C1" }}>SPIN</span> TO WIN
      </div>
      <div ref={reelRowRef} style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: size === "compact" ? "8px 12px" : "16px 24px", gap: size === "compact" ? 8 : 16, flex: size === "compact" ? undefined : "1 1 0", minHeight: 0 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ flex: 1, height: size === "compact" ? REEL_H : "100%", overflow: "hidden", position: "relative", borderRadius: 16, background: "#06040f", boxShadow: "inset 0 3px 10px rgba(5,0,13,0.85), inset 0 -3px 10px rgba(5,0,13,0.7)" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-50%)", height: SEG_H, borderRadius: 12, border: "1px solid rgba(217,79,220,0.55)", boxShadow: "0 0 0 1px rgba(217,79,220,0.12) inset, 0 0 24px rgba(217,79,220,0.22)", pointerEvents: "none", zIndex: 3 }} />
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 60, background: "linear-gradient(to bottom, #06040f, transparent)", zIndex: 4, pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(to top, #06040f, transparent)", zIndex: 4, pointerEvents: "none" }} />
            <div ref={reelRefs[i]} style={{ position: "absolute", width: "100%", top: 0, display: "flex", flexDirection: "column" }}>
              {STRIP.map((s, j) => (
                <div key={j} style={{ height: SEG_H, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size === "compact" ? "clamp(10px,1.5vw,16px)" : "clamp(18px,2.6vw,34px)", letterSpacing: 2, textAlign: "center", padding: "0 8px", lineHeight: 1.2, color: s.color, background: s.bg, fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {s.label}
                </div>
              ))}
            </div>
            {/* Glass highlight sweep - same treatment as the Hard Deck wheel window */}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 22%, rgba(255,255,255,0) 40%)", pointerEvents: "none" as const, zIndex: 5 }} />
          </div>
        ))}
      </div>

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
