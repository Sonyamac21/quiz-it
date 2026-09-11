// Small branded SVG icon set replacing OS emoji glyphs on team cards and the
// player keypad (🚫 block, 🔀 scramble, ⚡ fastest). Emoji render inconsistently
// across phones/browsers/TVs - different weight, color, and even shape
// depending on the OS's own emoji font - and read as visibly unfinished next
// to the rest of the app's deliberate purple/magenta design system. These are
// plain stroke/fill SVGs sized via `1em` so they always match the text
// they sit next to, colored via `currentColor` so they pick up whatever
// color the surrounding text/button already uses.
import type { CSSProperties } from "react";

type IconProps = { style?: CSSProperties; className?: string };

export function IconBlock({ style, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" style={{ display: "inline-block", verticalAlign: "-0.125em", ...style }} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <line x1="6" y1="18" x2="18" y2="6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconShuffle({ style, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" style={{ display: "inline-block", verticalAlign: "-0.125em", ...style }} className={className} aria-hidden="true">
      <path d="M3 7h3.5c1.4 0 2.7.7 3.5 1.9L15 17c.8 1.2 2.1 1.9 3.5 1.9H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 17h3.5c1.4 0 2.7-.7 3.5-1.9l1-1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 7c.8-1.2 2.1-1.9 3.5-1.9H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18.5 3.5 21 6l-2.5 2.5M18.5 15.5 21 18l-2.5 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconBolt({ style, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" style={{ display: "inline-block", verticalAlign: "-0.125em", ...style }} className={className} aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}
