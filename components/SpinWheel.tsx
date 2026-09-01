"use client";
import { useEffect, useRef, useState } from "react";

export type WheelSegment = { label: string; type: string; bg: string; accent: string; text: string };

const DEFAULT_SEGS: WheelSegment[] = [
  { label:"1st Place", type:"place", bg:"#BE26C1", accent:"#E050E3", text:"#fff" },
  { label:"-10 pts",   type:"neg",   bg:"#1A0A2E", accent:"#7C3AED", text:"#FF8888" },
  { label:"2nd Place", type:"place", bg:"#7C3AED", accent:"#A855F7", text:"#fff" },
  { label:"-20 pts",   type:"neg",   bg:"#150818", accent:"#6B21A8", text:"#FF6666" },
  { label:"3rd Place", type:"place", bg:"#5A0D9C", accent:"#8B5CF6", text:"#fff" },
  { label:"-30 pts",   type:"neg",   bg:"#0D0820", accent:"#4C1D95", text:"#FF4444" },
  { label:"+50 pts",   type:"bonus", bg:"#0A1F0A", accent:"#16A34A", text:"#4ADE80" },
  { label:"Last Place",type:"last",  bg:"#200A0A", accent:"#991B1B", text:"#FCA5A5" },
];

// Approved direction (after several rounds of mockups): a clean, modern
// cabinet in the app's own purple/magenta family only - no rainbow of team
// colours, no gold/bulbs. Segments cycle through tonal purples (dark to
// bright magenta) so teams are still distinguishable by position/shade
// without turning the drum into a mismatched rainbow.
const TEAM_PALETTE: { bg: string; accent: string; text: string }[] = [
  { bg:"#2E1A52", accent:"#D94FDC", text:"#fff" },
  { bg:"#4A2470", accent:"#D94FDC", text:"#fff" },
  { bg:"#6B2F9E", accent:"#F0A6F2", text:"#fff" },
  { bg:"#8A1B8D", accent:"#F0A6F2", text:"#fff" },
];

export function buildTeamSegments(teamNames: string[]): WheelSegment[] {
  return teamNames.map((name, i) => ({
    label: name,
    type: "team",
    ...TEAM_PALETTE[i % TEAM_PALETTE.length],
  }));
}

type Seg = WheelSegment;
type Props = { onResult: (seg: Seg) => void; size?: number; teamName?: string; segments?: WheelSegment[]; forceResultIndex?: number; autoSpin?: boolean; onSpinStart?: () => void; allowManualSpin?: boolean };

export function SpinWheel({ onResult, size = 400, segments, forceResultIndex, autoSpin, onSpinStart, allowManualSpin = true }: Props) {
  const SEGS = segments && segments.length > 0 ? segments : DEFAULT_SEGS;
  const N = SEGS.length;
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
      const shade = 1 - norm * 0.22;
      const segTop = segCY - SH/2, segBot = segCY + SH/2;
      const cTop = Math.max(segTop, dy), cBot = Math.min(segBot, dy+DH);
      if (cTop >= cBot) continue;
      ctx.save();
      ctx.beginPath(); ctx.rect(CX-DW/2, cTop, DW, cBot-cTop); ctx.clip();
      ctx.globalAlpha = shade * 0.7 + 0.3;
      ctx.fillStyle = seg.bg; ctx.fillRect(CX-DW/2, cTop, DW, cBot-cTop);
      // Soft top highlight / bottom shadow per chip (approximates the CSS
      // inset box-shadow look from the approved mockup) instead of the old
      // full-width diagonal metal-shine gradient, which read as a cheap
      // slot-machine effect rather than a premium flat "chip".
      const topHi = ctx.createLinearGradient(0, segTop, 0, segTop + SH*0.35);
      topHi.addColorStop(0, "rgba(255,255,255,0.14)");
      topHi.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = topHi; ctx.fillRect(CX-DW/2, cTop, DW, cBot-cTop);
      const botSh = ctx.createLinearGradient(0, segBot - SH*0.4, 0, segBot);
      botSh.addColorStop(0, "rgba(0,0,0,0)");
      botSh.addColorStop(1, "rgba(0,0,0,0.22)");
      ctx.fillStyle = botSh; ctx.fillRect(CX-DW/2, cTop, DW, cBot-cTop);
      ctx.globalAlpha = shade;
      const fs = Math.max(14, Math.round(16 + 10 * shade));
      ctx.font = "900 " + fs + "px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = seg.text;
      if (shade > 0.45) { ctx.shadowColor = seg.accent; ctx.shadowBlur = 22 * shade; }
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

    // Selection window: a soft glowing rounded band across the middle,
    // matching the approved mockup, rather than gold rim ellipses + a
    // pulsing bulb chase (dropped along with the rest of the bulb chrome).
    ctx.save();
    const bandH = SH * 1.02, bandY = CY - bandH/2;
    const bandGrad = ctx.createLinearGradient(0, bandY, 0, bandY+bandH);
    bandGrad.addColorStop(0, "rgba(217,79,220,0.05)");
    bandGrad.addColorStop(0.5, "rgba(217,79,220,0.14)");
    bandGrad.addColorStop(1, "rgba(217,79,220,0.05)");
    ctx.fillStyle = bandGrad;
    ctx.fillRect(CX-DW/2, bandY, DW, bandH);
    ctx.shadowColor = "rgba(217,79,220,0.55)"; ctx.shadowBlur = 14;
    ctx.strokeStyle = "rgba(217,79,220,0.7)"; ctx.lineWidth = 1.5;
    ctx.strokeRect(CX-DW/2+2, bandY, DW-4, bandH);
    ctx.restore();
  }

  function getResult() { return SEGS[((Math.round(offsetRef.current)) % N + N) % N]; }
  function loopLights() { drawDrum(offsetRef.current); lightRaf.current = requestAnimationFrame(loopLights); }

  useEffect(() => {
    drawDrum(offsetRef.current);
    lightRaf.current = requestAnimationFrame(loopLights);
    return () => cancelAnimationFrame(lightRaf.current);
  }, []);

  useEffect(() => {
    if (autoSpin && forceResultIndex !== undefined && forceResultIndex !== null) spin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSpin, forceResultIndex]);

  function spin() {
    if (spinning) return;
    setSpinning(true);
    onSpinStart?.();
    onSpinStart?.();
    cancelAnimationFrame(lightRaf.current);
    lastTickOffset.current = offsetRef.current;
    const extraRotations = -(30 + Math.floor(Math.random()*10));
    let target: number;
    if (forceResultIndex !== undefined) {
      // Land exactly on forceResultIndex: round(target) % N must equal forceResultIndex
      const base = offsetRef.current + extraRotations;
      const baseMod = ((Math.round(base) % N) + N) % N;
      let diff = forceResultIndex - baseMod;
      // Normalize diff to the smallest adjustment so we don't overshoot by a near-full lap
      if (diff > N / 2) diff -= N;
      if (diff < -N / 2) diff += N;
      target = base + diff;
    } else {
      target = offsetRef.current + extraRotations - Math.random();
    }
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

  // Cabinet chrome: clean, modern, Quiz-It purple/magenta only - no gold trim,
  // no bulb rows. Approved after several rounds of mockups: an ambient purple
  // glow behind a dark rounded card, a diagonal glass highlight over the
  // drum window, and refined Inter/Bruno Ace SC typography rather than
  // casino/slot-machine chrome. Only this wrapper + the glass overlay below
  // are new; the canvas drum drawing/animation above is untouched apart from
  // the segment-colour and selection-window changes noted there.
  return (
    <div style={{
      position: "relative", width: "100%", maxWidth: W + 60, borderRadius: 32,
      background: "linear-gradient(160deg, #1D1140, #12081F)",
      padding: 18,
      boxShadow: "0 30px 60px rgba(0,0,0,0.55), 0 0 90px rgba(190,38,193,0.14), inset 0 1px 0 rgba(255,255,255,0.06)",
    }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ display: "inline-block", padding: "6px 24px", borderRadius: 999, background: "rgba(217,79,220,0.08)", border: "1px solid rgba(217,79,220,0.35)" }}>
          <span style={{ fontFamily: "'Bruno Ace SC',var(--font-logo),cursive", fontSize: 16, letterSpacing: ".05em" }}>
            <span style={{ color: "#BE26C1" }}>QUIZ-</span><span style={{ color: "#ffffff" }}>IT</span>
          </span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, padding: "4px 4px 0" }}>
        <div style={{
          position: "relative", borderRadius: 24, overflow: "hidden",
          boxShadow: "inset 0 2px 0 rgba(255,255,255,0.03), inset 0 12px 24px rgba(0,0,0,0.6), inset 0 -12px 24px rgba(0,0,0,0.6)",
        }}>
          <div style={{ position:"absolute", left:-18, top:"50%", transform:"translateY(-50%)", width:0, height:0, borderTop:"20px solid transparent", borderBottom:"20px solid transparent", borderLeft:"34px solid #D94FDC", filter:"drop-shadow(0 0 10px rgba(217,79,220,0.6))", zIndex:10 }} />
          <div style={{ position:"absolute", right:-18, top:"50%", transform:"translateY(-50%)", width:0, height:0, borderTop:"20px solid transparent", borderBottom:"20px solid transparent", borderRight:"34px solid #D94FDC", filter:"drop-shadow(0 0 10px rgba(217,79,220,0.6))", zIndex:10 }} />
          <canvas ref={canvasRef} width={W} height={H} style={{ display:"block", maxWidth:"85vw", background: "#0D0618" }} />
          {/* Glass highlight sweep - a static diagonal gloss over the drum
              window, the detail that reads as "premium material" rather than
              a flat coloured rectangle. */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(115deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 22%, rgba(255,255,255,0) 40%)" }} />
        </div>
        {/* The manual spin button is HOST-ONLY. Passive surfaces (player handsets
            and the venue display) pass allowManualSpin={false} and drive the wheel
            purely via autoSpin/forceResultIndex, so only the host can start the
            Hard Deck team-selection spin. */}
        {allowManualSpin && !autoSpin && (
          <button onClick={spin} disabled={spinning} style={{ padding:"13px 44px", background:spinning?"#1a1a2e":"linear-gradient(180deg,#D94FDC,#9A1F9E)", color:"#fff", border: "none", borderRadius:16, fontSize:13, fontWeight:700, fontFamily:"'Inter',sans-serif", letterSpacing:1.5, cursor:spinning?"not-allowed":"pointer", boxShadow:spinning?"none":"0 8px 20px rgba(190,38,193,0.35), inset 0 1px 0 rgba(255,255,255,0.25)", opacity:spinning?0.4:1, transition:"all 0.2s" }}>
            {spinning ? "SPINNING..." : "SPIN"}
          </button>
        )}
      </div>
    </div>
  );
}
