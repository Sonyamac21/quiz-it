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
        // Small safety margin below the CSS max-height this text sits in -
        // without it, a shrink that lands right at the limit could still
        // get its last line's descenders clipped by the container's own
        // overflow:hidden after fonts/kerning settle slightly differently
        // than this measurement pass. Reported as "I cannot read the full
        // question" - the second line was visibly sliced off mid-letter.
        //
        // Bug (round 1): this budget used to be maxViewportHeight *
        // window.innerHeight - a fixed FRACTION OF THE WHOLE SCREEN,
        // regardless of how much this element's own flex siblings (status
        // bar, timer row, and especially the answer keypad/options BELOW
        // it) actually leave available. Switching to a fraction of the
        // PARENT's clientHeight (.qi-player-question-scroll) was closer,
        // but still a fixed fraction of that parent - which is exactly as
        // wrong when the sibling below (a tall numeric keypad, say) needs
        // MORE than "100% - maxViewportHeight%" of the parent, or when it
        // needs less and the text could safely go bigger. Reported again
        // as "the text for the question still doesn't quite fit" even
        // after the round-1 fix.
        //
        // Real fix: measure how much height the OTHER children of this
        // parent actually occupy at their natural size, and give this text
        // whatever's left over - genuinely adapting to whatever's sharing
        // the screen with it (multi-choice options, multi-tap grid,
        // Sequence's own UI, or the numeric/text keypad), not a guessed
        // percentage. maxViewportHeight is kept as an upper CEILING only,
        // so a short keypad doesn't let the question balloon to fill the
        // whole screen.
        const parent = element.parentElement;
        const availableHeight = parent ? parent.clientHeight : window.innerHeight;
        let siblingsHeight = 0;
        if (parent) {
          for (const child of Array.from(parent.children)) {
            if (child !== element) siblingsHeight += (child as HTMLElement).offsetHeight;
          }
        }
        const remaining = availableHeight - siblingsHeight;
        const ceiling = Math.max(48, availableHeight * maxViewportHeight);
        const limit = Math.max(48, Math.min(ceiling, remaining > 0 ? remaining : ceiling)) * 0.94;
        let next = authored;
        element.style.fontSize = `${next}px`;
        for (let attempt = 0; attempt < 10 && element.scrollHeight > limit && next > minFontSize; attempt += 1) {
          next = Math.max(minFontSize, next * (limit / element.scrollHeight) * 0.92);
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
