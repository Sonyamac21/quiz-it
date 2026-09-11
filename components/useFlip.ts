"use client";
import { useLayoutEffect, useRef } from "react";

// Generic FLIP (First-Last-Invert-Play) list-reorder animation. Attach the
// returned ref to the container that wraps the reorderable rows; each row
// inside needs a stable `data-flip-key` attribute (team name, id, etc).
// Whenever the DOM order/position of a keyed row changes between renders,
// this animates it smoothly from its old position to its new one via a
// transform + transition, rather than the row silently teleporting.
// Pure presentation - never touches scores/ranks, just watches the DOM.
export function useFlip<T extends HTMLElement>(deps: unknown[]) {
  const containerRef = useRef<T | null>(null);
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-flip-key]"));
    const prevRects = prevRectsRef.current;
    if (!reducedMotion) {
      rows.forEach((row) => {
        const key = row.getAttribute("data-flip-key")!;
        const prev = prevRects.get(key);
        if (!prev) return;
        const next = row.getBoundingClientRect();
        const dy = prev.top - next.top;
        if (Math.abs(dy) < 1) return;
        row.style.transition = "none";
        row.style.transform = `translateY(${dy}px)`;
        // Force a reflow before removing the "none" transition so the
        // browser actually registers the starting transform.
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        row.getBoundingClientRect();
        row.style.transition = "transform 0.5s var(--settle, cubic-bezier(0.22,1,0.36,1))";
        row.style.transform = "translateY(0)";
      });
    }
    const nextRects = new Map<string, DOMRect>();
    rows.forEach((row) => {
      const key = row.getAttribute("data-flip-key");
      if (key) nextRects.set(key, row.getBoundingClientRect());
    });
    prevRectsRef.current = nextRects;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return containerRef;
}
