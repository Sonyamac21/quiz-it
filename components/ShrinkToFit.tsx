"use client";
import { forwardRef, type CSSProperties, type ReactNode, type Ref } from "react";

// Renders `children` visually scaled down (never up) by `scale`, with the
// outer box's reserved height matching the scaled visual size exactly -
// so overflow:hidden on an ancestor never clips it. `scale` is computed
// externally (see usePlayerAnswerAreaFit in PlayerQuizScreen), alongside
// the question-text wrap's own height, in ONE coordinated measurement -
// this component itself no longer measures anything.
//
// History: this used to self-measure via its own ResizeObserver, which
// fixed "did you fix the spacing on the player screens? we have no
// access to the lock it in button" but, measured in isolation from the
// question-text wrap above it (which ALSO self-sizes, via flex-grow +
// FitBlockText's own fit loop), the two fought over the same space with
// no shared source of truth - producing a worse bug: "even here - lots
// of space" / "missing all of the options" - the question wrap could
// inflate first and leave this component too little room, or vice
// versa, with neither side aware of what the other actually needed.
// Coordinating both from one controller, which measures every sibling's
// real natural size before deciding the split, replaces that fight with
// a single, consistent answer.
export const ShrinkToFit = forwardRef<HTMLDivElement, {
  children: ReactNode;
  scale: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
  innerRef?: Ref<HTMLDivElement>;
}>(function ShrinkToFit({ children, scale, height, className, style, innerRef }, ref) {
  return (
    <div ref={ref} className={className} style={{ ...style, flexShrink: 0, overflow: "hidden", height }}>
      <div ref={innerRef} style={{ transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: "top center" }}>
        {children}
      </div>
    </div>
  );
});
