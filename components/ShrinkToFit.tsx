"use client";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// Guarantees the player handset's answer area (numeric/text keypad,
// multi-choice options, multi-tap grid) is never clipped by
// .qi-player-question-scroll's overflow:hidden.
//
// Host, live: "did you fix the spacing on the player screens? we have no
// access to the lock it in button." The flexShrink:0 fix on these wraps
// (see the comment where they're used) only stops them LOSING a
// flex-shrink fight against the question text above - it does nothing if
// this block's own natural size, even after the question text has shrunk
// to its own floor, still doesn't fit in the space physically left on the
// screen. In that case flexShrink:0 just means the LOCK IT IN row is the
// part that overflows and gets clipped, guaranteed, every time.
//
// This measures the real space between this block's top and the bottom of
// its scroll container on every layout change (question length, timer
// badge, error banner, keyboard rows) and, only if the block's natural
// height doesn't fit that space, scales the WHOLE block down uniformly -
// same "measure real pixels, never guess" approach already proven in
// FitScaleBlock, but via a transform rather than a CSS-variable
// multiplier, since AnswerKeypad/the option lists are sized with inline
// styles rather than --qi-fit-scale-aware CSS. When there's room (the
// common case), scale stays at 1 and this is a no-op.
export function ShrinkToFit({
  children,
  scrollContainerClassName,
  minScale = 0.55,
  className,
  style,
}: {
  children: ReactNode;
  scrollContainerClassName: string;
  minScale?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [reservedHeight, setReservedHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const scrollContainer = outer.closest("." + scrollContainerClassName) as HTMLElement | null;
    if (!scrollContainer) return;

    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Measure at natural (unscaled) size first so scrollHeight/top
        // reflect the block's real content, not a previous scale pass.
        inner.style.transform = "none";
        outer.style.height = "auto";
        const naturalHeight = inner.scrollHeight;
        const containerBottom = scrollContainer.getBoundingClientRect().bottom;
        const outerTop = outer.getBoundingClientRect().top;
        const available = containerBottom - outerTop;
        if (naturalHeight <= 0 || available <= 0) return;
        const next = Math.max(minScale, Math.min(1, available / naturalHeight));
        setScale(next);
        setReservedHeight(next < 1 ? naturalHeight * next : null);
      });
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(scrollContainer);
    observer.observe(inner);
    window.addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [children, scrollContainerClassName, minScale]);

  return (
    <div ref={outerRef} className={className} style={{ ...style, flexShrink: 0, overflow: "hidden", height: reservedHeight ?? undefined }}>
      <div ref={innerRef} style={{ transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: "top center" }}>
        {children}
      </div>
    </div>
  );
}
