"use client";
import { useEffect, useRef, useState } from "react";

// Small shared count-up used anywhere a number should feel like it's landing
// live rather than just appearing static - the points-earned chip on the
// player handset, leaderboard score changes on the display. Pure
// presentation: it animates from whatever it last rendered up to the target
// value passed in, using requestAnimationFrame so it's smooth regardless of
// how often the parent re-renders. Never touches or recomputes the actual
// score - `value` is always the real, already-authoritative number.
export function CountUp({ value, durationMs = 650, style, className }: { value: number; durationMs?: number; style?: React.CSSProperties; className?: string }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reducedMotion || value === fromRef.current) { setDisplay(value); fromRef.current = value; return; }
    const from = fromRef.current;
    const delta = value - from;
    const start = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out cubic - fast start, gentle settle, matches the app's --settle feel
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + delta * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span style={style} className={className}>{display}</span>;
}
