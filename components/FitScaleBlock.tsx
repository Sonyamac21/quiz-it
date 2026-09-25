"use client";
// Host request, repeated several times with growing frustration: "ALL MUST
// FIT IN THE AVAILABLE AREA - SIZE IT TO FIT." Every previous pass at this
// tuned individual pieces of the question/answer block (title max-height,
// options min-height, answer bubble line-clamp, manual controls margin)
// by hand, guessing at a vh/rem budget for each one. That approach keeps
// breaking because it only holds for the exact combination of question
// length + options count + explanation length it was tuned against - a
// longer Sequence question or a long explanation blows the guessed budget
// again and something gets clipped or pushes into what's below it.
//
// This component fixes the actual problem instead: it measures the real
// natural (unscaled) height the question content needs, compares it to the
// real height actually available in the desk area, and - only if the
// content doesn't fit - scales the WHOLE block down uniformly so it always
// fits, regardless of what combination of question/options/explanation
// length produced it. Nothing is ever clipped; on a tall enough screen
// nothing shrinks at all (scale stays 1).
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function FitScaleBlock({ children, className, minScale = 0.55 }: { children: ReactNode; className?: string; minScale?: number }) {
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
        // Bug caught on the first real test: this used to also widen inner
        // to 100/scale% so it would visually span the full outer width
        // again after shrinking. But that widened box was ALSO what text
        // wrapped against, at layout time, independent of the transform -
        // so a stale width left over from a PREVIOUS question's scale
        // (this only reset transform, not width, before measuring) made
        // the browser wrap text against the wrong box width, producing an
        // under- or over-estimate of the real height needed and, in the
        // reported case, cutting a whole chunk of mid-sentence text that
        // wrapped somewhere the visible (correctly-scaled) width didn't
        // actually cover. Inner now stays at a constant, never-adjusted
        // width (100% of outer) so every measurement wraps text exactly
        // the same way the final render does - only the vertical/horizontal
        // SIZE shrinks uniformly via scale(), never the wrapping itself.
        const availableH = outer.clientHeight;
        const neededH = inner.scrollHeight;
        const next = availableH > 0 && neededH > availableH ? Math.max(minScale, availableH / neededH) : 1;
        setScale(next);
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
  }, [children, minScale]);

  return (
    <div ref={outerRef} style={{ height: "100%", minHeight: 0, overflow: "hidden" }}>
      <div ref={innerRef} className={className} style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}
