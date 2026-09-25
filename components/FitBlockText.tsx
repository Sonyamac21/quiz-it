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
        // Bug: this budget used to be maxViewportHeight * window.innerHeight
        // - a fixed FRACTION OF THE WHOLE SCREEN, regardless of how much
        // this element's own flex siblings (status bar, timer row, and
        // especially the answer keypad/options BELOW it) actually leave
        // available. On a question screen with a tall status bar and a
        // numeric keypad underneath, that fixed fraction let this text
        // grow larger than the real remaining space, so it overflowed past
        // its own box into the keypad below (reported: "the question still
        // isn't fully visible"). The element's DIRECT PARENT
        // (.qi-player-question-scroll, a flex:1 column that already
        // correctly absorbs everything above/below it) is the actual
        // available-space budget for this text plus whatever answer UI
        // shares it - measuring THAT instead makes this genuinely adapt to
        // whatever room is really left, on any device, instead of guessing
        // a screen-wide percentage.
        const parent = element.parentElement;
        const availableHeight = parent ? parent.clientHeight : window.innerHeight;
        const limit = Math.max(48, availableHeight * maxViewportHeight) * 0.94;
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
