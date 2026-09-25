"use client";
// Host request, repeated several times with growing frustration: "ALL MUST
// FIT IN THE AVAILABLE AREA - SIZE IT TO FIT" ... "fill area available."
// Every previous pass at this tuned individual pieces of the question/
// answer block (title max-height, options min-height, answer bubble
// line-clamp, manual controls margin) by hand, guessing at a vh/rem budget
// for each one. That approach keeps breaking because it only holds for the
// exact combination of question length + options count + explanation
// length it was tuned against - a longer Sequence question or a long
// explanation blows the guessed budget again and something gets clipped or
// pushes into what's below it. And a SHORT question left a dead gap of
// unused purple space below the block instead of using the room it had.
//
// First attempt used a CSS transform:scale() on the whole block. That's
// safe for shrinking (never creates new overflow) but wrong for growing to
// "fill" the space: transform doesn't change layout, so scaling UP would
// either blow past the available width (if allowed to) or - if capped by
// width, which is essentially always already 100% of the container with no
// slack - never actually grow at all. Filling unused height while staying
// within a FIXED width means the text genuinely needs to re-wrap at a
// bigger font size, not just be visually stretched.
//
// So this drives a CSS custom property (--qi-fit-scale) that the relevant
// rules in globals.css multiply their font-size/spacing by, and binary-
// searches for the largest value whose real (reflowed) height still fits
// the available space - shrinking that same way if even the smallest
// allowed value doesn't fit. Every step measures the ACTUAL rendered
// scrollHeight at that candidate size, so it reflects real reflow, not a
// guess.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function FitScaleBlock({ children, className, minScale = 0.6, maxScale = 2.1 }: { children: ReactNode; className?: string; minScale?: number; maxScale?: number }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const availableH = outer.clientHeight;
        if (availableH <= 0) return;
        const setCandidate = (v: number) => inner.style.setProperty("--qi-fit-scale", String(v));
        const fitsAt = (v: number) => {
          setCandidate(v);
          return inner.scrollHeight <= availableH;
        };
        let best = minScale;
        if (fitsAt(maxScale)) {
          best = maxScale;
        } else if (!fitsAt(minScale)) {
          // Doesn't fit even at the smallest allowed size - use the floor
          // rather than clipping; this is the same safety floor the
          // original transform version used.
          best = minScale;
        } else {
          let lo = minScale;
          let hi = maxScale;
          for (let i = 0; i < 8; i += 1) {
            const mid = (lo + hi) / 2;
            if (fitsAt(mid)) { best = mid; lo = mid; } else { hi = mid; }
          }
        }
        setCandidate(best);
        setScale(best);
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    observer.observe(inner);
    window.addEventListener("resize", fit);
    document.fonts?.addEventListener?.("loadingdone", fit);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", fit);
      document.fonts?.removeEventListener?.("loadingdone", fit);
    };
  }, [children, minScale, maxScale]);

  return (
    <div ref={outerRef} style={{ height: "100%", minHeight: 0, overflow: "hidden" }}>
      <div ref={innerRef} className={className} style={{ ["--qi-fit-scale" as string]: scale }}>
        {children}
      </div>
    </div>
  );
}
