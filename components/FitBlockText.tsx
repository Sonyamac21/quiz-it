"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

type FitBlockTextProps = {
  as?: "div" | "h1" | "p";
  children: string;
  className?: string;
  maxViewportHeight?: number;
  minFontSize?: number;
  style?: CSSProperties;
};

/** Fit complete wrapped copy without line-clamping away quiz information. */
export function FitBlockText({ as = "div", children, className, maxViewportHeight = 0.22, minFontSize = 13, style }: FitBlockTextProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [fontSize, setFontSize] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Bug: fontSize state from the PREVIOUS question stayed applied to the
    // new question's (possibly much longer) text for one paint, because the
    // actual re-measure only happens inside the requestAnimationFrame below,
    // one frame after this effect (and therefore the new `children` text)
    // has already committed to the DOM. On the host console specifically,
    // "Next Q" can jump from a short question to a long Sequence question
    // whose full unshrunk text is tall enough to visibly push up into/behind
    // the meta pill row above it for that one frame - confirmed live as
    // exactly this "question text overlapping the Q7/Sequence/HOST PREVIEW
    // pills" report. Clearing to null HERE, synchronously inside
    // useLayoutEffect (which commits before the browser paints), means the
    // new text's first-ever paint uses the authored CSS clamp() size, never
    // a stale pixel value left over from a different, shorter question.
    setFontSize(null);
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        element.style.fontSize = "";
        const authored = parseFloat(getComputedStyle(element).fontSize) || minFontSize;
        const limit = Math.max(48, window.innerHeight * maxViewportHeight);
        let next = authored;
        element.style.fontSize = `${next}px`;
        for (let attempt = 0; attempt < 8 && element.scrollHeight > limit && next > minFontSize; attempt += 1) {
          next = Math.max(minFontSize, next * (limit / element.scrollHeight) * 0.98);
          element.style.fontSize = `${next}px`;
        }
        setFontSize(next);
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (element.parentElement) observer.observe(element.parentElement);
    window.addEventListener("resize", fit);
    document.fonts?.addEventListener?.("loadingdone", fit);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", fit);
      document.fonts?.removeEventListener?.("loadingdone", fit);
    };
  }, [children, maxViewportHeight, minFontSize]);

  const Tag = as;
  return <Tag ref={ref as never} className={className} style={{ ...style, ...(fontSize == null ? {} : { fontSize }) }}>{children}</Tag>;
}
