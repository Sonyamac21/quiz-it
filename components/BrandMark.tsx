"use client";
// Shared "QUIZ-IT / Powered by / Mac Entertainment / by Sonya Mac" credit -
// a fixed four-line block, treated as a single recurring logo lockup rather
// than a caption: every line is its own row (not wrapped or paired onto a
// shared line) so the whole thing reads as one neat rectangle wherever it's
// dropped in - Back Office header, Display screen, Pursuit board, player
// handset, venue showreel, join page. Before this component existed, every
// one of those screens had its own hand-rolled copy: some on one line with
// a "·" separator, some missing "by Sonya Mac" entirely (the Back Office
// header was one of those), with different fonts/sizes/spacing each time.
// This is the single source of truth for that content and its relative
// hierarchy (brand name boldest/brightest, "Powered by" the smallest lead-
// in, "Mac Entertainment" and "by Sonya Mac" matching each other) - callers
// only choose a `size` for their own scale (a TV overlay needs a much
// bigger absolute size than a mobile corner badge) and, optionally, text
// alignment; every size keeps the same four-line order and the same ratio
// between lines.
//
// Host request: centering each line wasn't enough to read as a "rectangle"
// logo - the lines are naturally different widths ("Mac Entertainment" is
// much wider than "Powered by"), so centered text still has a ragged left
// and right edge. Rather than distorting the letters with a horizontal
// CSS scale (which stretches the glyphs themselves and looks warped), each
// line's letter-spacing is measured and adjusted after mount so every line
// stretches, via natural spacing between its own letters, to exactly the
// width of the widest line - the same effect a designer gets manually
// kerning a logo lockup to a fixed width.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const SCALE: Record<"xs" | "sm" | "md" | "lg" | "xl", number> = {
  xs: 0.6,
  sm: 0.8,
  md: 1,
  lg: 1.6,
  xl: 2.4,
};

function JustifiedLine({
  children,
  style,
  targetWidth,
  onMeasured,
  justify,
}: {
  children: ReactNode;
  style: CSSProperties;
  targetWidth: number | null;
  onMeasured: (width: number) => void;
  justify: "flex-start" | "center" | "flex-end";
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measure at this line's own natural (unadjusted) letter-spacing first,
    // then report that width up so the widest line among the four can be
    // found before any line applies its own stretch.
    el.style.letterSpacing = "0.01em";
    const natural = el.getBoundingClientRect().width;
    onMeasured(natural);
    if (targetWidth && natural > 0) {
      const chars = (el.textContent || "").length;
      // Distributing the shortfall across the character count (rather than
      // gaps = chars-1) is a close-enough approximation - letter-spacing
      // visually adds trailing space after the final character too in most
      // browsers, so this doesn't overshoot the target width.
      const extraPerChar = chars > 0 ? (targetWidth - natural) / chars : 0;
      setLetterSpacing(extraPerChar);
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetWidth]);

  return (
    <div style={{ display: "flex", justifyContent: justify }}>
      <span
        ref={ref}
        style={{
          ...style,
          letterSpacing: ready ? `calc(0.01em + ${letterSpacing}px)` : "0.01em",
          visibility: ready || !targetWidth ? "visible" : "hidden",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </span>
    </div>
  );
}

export function BrandMark({
  size = "md",
  align = "left",
  color = "#fff",
  stretch = false,
}: {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  align?: "left" | "center" | "right";
  color?: string;
  // Host, repeatedly, about the handset's fixed bottom bar: "stretch it
  // across the WHOLE bottom of the screen... do NOT distort the
  // letters... but you could have QUIZ-IT on a double line, then powered
  // by etc on separate lines." Every line already gets justified via real
  // letter-spacing (not a CSS scaleX warp) to match the WIDEST of the four
  // lines at their natural size - which stretches them to match each
  // OTHER, but that natural widest-line width is nowhere near the actual
  // screen width once the lockup is small enough to fit a corner badge.
  // `stretch` swaps that target from "the widest of these four lines" to
  // "the full width of whatever container this is placed in" (measured
  // live via ResizeObserver), so the whole lockup spans edge to edge of
  // its container using the exact same real-kerning mechanism, not a
  // distorting transform.
  stretch?: boolean;
}) {
  const s = SCALE[size];
  const measured = useRef<number[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [targetWidth, setTargetWidth] = useState<number | null>(null);
  const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";

  useLayoutEffect(() => {
    if (!stretch) return;
    const el = containerRef.current;
    if (!el) return;
    const update = () => setTargetWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [stretch]);

  function handleMeasured(index: number, width: number) {
    if (stretch) return;
    measured.current[index] = width;
    if (measured.current.filter(w => w > 0).length === 4) {
      const widest = Math.max(...measured.current);
      if (widest !== targetWidth) setTargetWidth(widest);
    }
  }

  const nameStyle: CSSProperties = {
    fontFamily: "var(--font-bruno-ace-sc,'Bruno Ace SC'),cursive",
    fontSize: `${17 * s}px`,
  };
  const poweredByStyle: CSSProperties = {
    fontFamily: "var(--font-bruno-ace-sc,'Bruno Ace SC'),cursive",
    fontSize: `${6.5 * s}px`,
    color,
    opacity: 0.6,
  };
  const macStyle: CSSProperties = {
    fontFamily: "var(--font-bruno-ace-sc,'Bruno Ace SC'),cursive",
    fontSize: `${10 * s}px`,
    color,
    opacity: 0.6,
  };
  const bySonyaStyle: CSSProperties = {
    fontFamily: "var(--font-bruno-ace-sc,'Bruno Ace SC'),cursive",
    fontSize: `${8.5 * s}px`,
    color,
    opacity: 0.5,
  };

  return (
    <div ref={containerRef} style={{ lineHeight: 1.25, width: stretch ? "100%" : undefined }}>
      <JustifiedLine style={nameStyle} targetWidth={targetWidth} onMeasured={w => handleMeasured(0, w)} justify={justify}>
        <span style={{ color: "#BE26C1" }}>QUIZ-</span>
        <span style={{ color }}>IT</span>
      </JustifiedLine>
      <div style={{ marginTop: `${2 * s}px` }}>
        <JustifiedLine style={poweredByStyle} targetWidth={targetWidth} onMeasured={w => handleMeasured(1, w)} justify={justify}>
          Powered by
        </JustifiedLine>
      </div>
      <JustifiedLine style={macStyle} targetWidth={targetWidth} onMeasured={w => handleMeasured(2, w)} justify={justify}>
        Mac Entertainment
      </JustifiedLine>
      <JustifiedLine style={bySonyaStyle} targetWidth={targetWidth} onMeasured={w => handleMeasured(3, w)} justify={justify}>
        by Sonya Mac
      </JustifiedLine>
    </div>
  );
}
