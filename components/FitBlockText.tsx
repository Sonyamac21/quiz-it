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
