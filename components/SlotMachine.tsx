"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { playShowAudio, stopShowAudio } from "@/lib/audio/showAudio";

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
      <div style={{ fontSize: "clamp(40px,6vw,80px)", letterSpacing: 6, color: "#ffffff", textTransform: "uppercase" as const }}>{teamName}</div>
      <div style={{ fontSize: "clamp(60px,12vw,160px)", letterSpacing: 4, color: seg.color, textAlign: "center", lineHeight: 1, fontWeight: 700 }}>{seg.label}</div>
      <button onClick={onDismiss} style={{ marginTop: 16, fontSize: "clamp(12px,1.5vw,20px)", letterSpacing: 4, color: "rgba(255,255,255,0.4)", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "12px 36px", cursor: "pointer" }}>
        Continue
      </button>
    </div>
  );
}

type SlotMachineProps = {
  initialTeamName?: string;
  initialVictorySong?: string;
  sessionPin?: string;
};

export default function SlotMachine({ initialTeamName, initialVictorySong, sessionPin }: SlotMachineProps = {}) {
  const [teamName, setTeamName] = useState(initialTeamName || "Loading...");
  const [victorySong, setVictorySong] = useState(initialVictorySong || "");
  const [teamLoading, setTeamLoading] = useState(!initialTeamName);
  const [teamError, setTeamError] = useState(false);
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

  const INITIAL_CENTRE = Math.floor(STRIP_LEN / 2);
  const INITIAL_TOP = -(INITIAL_CENTRE - 1) * SEG_H;

  useEffect(() => {
    reelTops.current = [INITIAL_TOP, INITIAL_TOP, INITIAL_TOP];
    reelRefs.forEach((r) => {
      if (r.current) r.current.style.top = INITIAL_TOP + "px";
    });
  }, []);

  const fetchLatestTeam = useCallback(async () => {
    setTeamLoading(true);
    setTeamError(false);
    try {
      // Must be scoped to the active session. Previously this queried the
      // newest team across the ENTIRE teams table (no session filter, and the
      // wrong `name` column), so it could surface a team from a completely
      // different / historical session. Without a session pin there is no safe
      // way to pick a team, so we do not guess a global one.
      if (!sessionPin) { setTeamName("Team"); setTeamError(true); return; }
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data, error } = await supabase
        .from("teams")
        .select("team_name, victory_song")
        .eq("session_pin", sessionPin)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) { setTeamName("Team"); setTeamError(true); }
      else {
        setTeamName(data.team_name || "Team");
        setVictorySong(data.victory_song || "");
      }
    } catch { setTeamName("Team"); setTeamError(true); }
    finally { setTeamLoading(false); }
  }, [sessionPin]);

  useEffect(() => { if (!initialTeamName) fetchLatestTeam(); }, [fetchLatestTeam, initialTeamName]);

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
    playShowAudio("slot-spin.mp3", { channel: "spin", loop: true });
  };
  const stopSpinSound = () => {
    stopShowAudio("spin");
  };
  useEffect(() => () => stopShowAudio("spin"), []);
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

  const launchFW = (_col: string) => {
    const cv = document.createElement('canvas');
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    cv.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60';
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    if (!ctx) { document.body.removeChild(cv); return; }
    const pts: { x: number; y: number; vx: number; vy: number; c: string; l: number; d: number; r: number }[] = [];
    const cols = ["#BE26C1","#F5C842","#ffffff","#22c55e","#c8c8d8","#ff6b6b","#ffd700","#00cfff","#ff69b4","#ff4500"];
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

  const playPositiveSounds = (songFile: string) => {
    playShowAudio("airhorn.mp3", { channel: "cue", volume: 0.65 });
    if (songFile) playShowAudio(encodeURIComponent(songFile), { channel: "music" });
  };

  const playNegativeSounds = () => {
    playShowAudio("sad-trombone.mp3", { channel: "cue", volume: 0.7 });
  };

  const pickDifferent = (exclude: number) => {
    let idx: number;
    do { idx = Math.floor(Math.random() * SEGS.length); } while (idx === exclude);
    return idx;
  };

  const landReelOn = (segIdx: number) => {
    const fullCycles = 8 + Math.floor(Math.random() * 4);
    const baseIdx = fullCycles * SEGS.length + segIdx;
    const landStripIdx = Math.min(baseIdx, STRIP_LEN - 3);
    return -(landStripIdx - 1) * SEG_H;
  };

  const doSpin = () => {
    if (spinning) return;
    setSpinning(true);
    startBulbs(false);
    startSpinSound();

    const winSegIdx = Math.floor(Math.random() * SEGS.length);
    const rebelReel = Math.floor(Math.random() * 3);
    const rebelIdx = pickDifferent(winSegIdx);
    const results = [winSegIdx, winSegIdx, winSegIdx];
    results[rebelReel] = rebelIdx;

    const durations = [2800, 4000, 6800];
    const delays = [0, 600, 1400];
    const easePowers = [4, 4, 2];

    [0, 1, 2].forEach((i) => {
      const startTop = reelTops.current[i];
      const targetTop = landReelOn(results[i]);

      animReel(i, startTop, targetTop, durations[i], delays[i], easePowers[i],
        i === 2 ? () => {
          stopSpinSound();
          setTimeout(() => {
            const rebelStart = reelTops.current[rebelReel];
            const rebelTarget = landReelOn(winSegIdx);
            animReel(rebelReel, rebelStart, rebelTarget, 2000, 0, 2, () => {
              setSpinning(false);
              stopBulbs();
              const actualResult = SEGS[winSegIdx];
              if (actualResult.positive) startBulbs(true);
              setTimeout(() => {
                setOverlay(actualResult);
                if (actualResult.positive) {
                  setTimeout(() => { launchFW(actualResult.color); }, 150);
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

  const renderBulbRow = (bottom = false) => (
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
      <canvas ref={fwCanvasRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 60 }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 24px 8px", borderBottom: "1px solid rgba(190,38,193,0.3)", background: "#0d0520", flexShrink: 0 }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "radial-gradient(circle, #3a0a4a, #1a0530)", border: "2px solid #BE26C1", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 14px rgba(190,38,193,0.6)", fontSize: 14, color: "#BE26C1", flexShrink: 0, fontWeight: 700 }}>ME</div>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", fontSize: "clamp(18px,2.5vw,32px)", letterSpacing: ".08em", textShadow: "0 0 16px rgba(190,38,193,0.6)" }}><span style={{ color: "#BE26C1" }}>QUIZ-</span><span style={{ color: "#fff" }}>IT</span></div>
          <div style={{ fontSize: "clamp(8px,1vw,13px)", letterSpacing: 3, color: "rgba(190,38,193,0.8)", marginTop: 2 }}>powered by Mac Entertainment</div>
        </div>
        <div style={{ width: 52 }} />
      </div>
      <div style={{ height: 2, background: "linear-gradient(90deg, transparent, #BE26C1, transparent)", animation: "qiGlowPulse 2s ease-in-out infinite", flexShrink: 0 }} />

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 24px 8px", background: "#0d0520", flexShrink: 0, borderBottom: "1px solid rgba(190,38,193,0.2)" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "rgba(190,38,193,0.6)", marginBottom: 4 }}>CURRENT TEAM</div>
          <div style={{ fontSize: "clamp(14px,1.8vw,22px)", color: teamError ? "#FF3B4E" : "#fff", fontWeight: 700, letterSpacing: 2, minHeight: 28 }}>
            {teamLoading ? "Loading..." : teamError ? "No team found" : teamName}
          </div>
          {victorySong ? <div style={{ fontSize: 10, color: "rgba(190,38,193,0.5)", marginTop: 2, letterSpacing: 1 }}>{victorySong.replace(/\.mp3$/i,"").replace(/SQS\s*$/i,"").trim()}</div> : null}
        </div>
        <button onClick={fetchLatestTeam} disabled={teamLoading} style={{ padding: "10px 20px", borderRadius: 10, background: "#1a0530", border: "1px solid rgba(190,38,193,0.5)", color: "#BE26C1", fontSize: 12, letterSpacing: 2, cursor: teamLoading ? "not-allowed" : "pointer", opacity: teamLoading ? 0.5 : 1, flexShrink: 0 }}>
          {teamLoading ? "..." : "REFRESH"}
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0d0818", borderLeft: "2px solid #7a107e", borderRight: "2px solid #7a107e", overflow: "hidden" }}>
        {renderBulbRow()}
        <div style={{ textAlign: "center", fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", padding: "10px 0 8px", fontSize: "clamp(22px,3.6vw,50px)", letterSpacing: ".14em", color: "#fff", textShadow: "0 0 24px rgba(190,38,193,0.7)", flexShrink: 0 }}>
          <span style={{ color: "#BE26C1" }}>SPIN</span> TO WIN
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
        {renderBulbRow(true)}
      </div>

      <div style={{ textAlign: "center", padding: "8px", fontSize: "clamp(8px,0.8vw,11px)", letterSpacing: 2, color: "rgba(190,38,193,0.3)", borderTop: "1px solid rgba(190,38,193,0.1)", background: "#07030f", flexShrink: 0 }}>
        Quiz-It powered by Mac Entertainment
      </div>

      {overlay && <OverlayPanel seg={overlay} teamName={teamName || "Team"} onDismiss={dismiss} />}
    </div>
  );
}
