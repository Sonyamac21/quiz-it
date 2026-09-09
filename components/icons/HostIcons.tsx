// Small, branded SVG icon set replacing the OS-emoji glyphs (🚫🔀⚡) previously
// used as live-state indicators on team cards and the scramble banner. Emoji
// render inconsistently across OS/browser emoji sets and read as unfinished
// on a big TV screen - see the platform review's Quick Win #1. Every icon
// uses `currentColor` so it inherits whatever colour the caller sets via
// normal CSS/style, matching how the emoji they replace could be recoloured
// with a text colour.
type IconProps = { size?: number; style?: React.CSSProperties };

export function BlockIcon({ size = 13, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "inline-block", verticalAlign: "middle", ...style }} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" />
      <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function ShuffleIcon({ size = 13, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: "inline-block", verticalAlign: "middle", ...style }} aria-hidden="true">
      <path d="M3 6h4.5c1.5 0 2.5.6 3.3 1.8L15 15c.8 1.2 1.8 1.8 3.3 1.8H21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 18h4.5c1.5 0 2.5-.6 3.3-1.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 6h6M15 6l3-2.6M15 6l3 2.6M18 15.8l3 2.6-3 2.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LightningIcon({ size = 13, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "inline-block", verticalAlign: "middle", ...style }} aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="currentColor" />
    </svg>
  );
}
