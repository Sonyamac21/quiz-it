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
const SCALE: Record<"xs" | "sm" | "md" | "lg" | "xl", number> = {
  xs: 0.6,
  sm: 0.8,
  md: 1,
  lg: 1.6,
  xl: 2.4,
};

export function BrandMark({
  size = "md",
  align = "left",
  color = "#fff",
}: {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  align?: "left" | "center" | "right";
  color?: string;
}) {
  const s = SCALE[size];
  return (
    <div style={{ textAlign: align, lineHeight: 1.25 }}>
      <div
        style={{
          fontFamily: "var(--font-bruno-ace-sc,'Bruno Ace SC'),cursive",
          fontSize: `${17 * s}px`,
          letterSpacing: ".01em",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ color: "#BE26C1" }}>QUIZ-</span>
        <span style={{ color }}>IT</span>
      </div>
      <div
        style={{
          marginTop: `${2 * s}px`,
          fontFamily: "var(--font-bruno-ace-sc,'Bruno Ace SC'),cursive",
          fontSize: `${8 * s}px`,
          letterSpacing: ".01em",
          color,
          opacity: 0.6,
          whiteSpace: "nowrap",
        }}
      >
        Powered by
      </div>
      <div
        style={{
          fontFamily: "var(--font-bruno-ace-sc,'Bruno Ace SC'),cursive",
          fontSize: `${10 * s}px`,
          letterSpacing: ".01em",
          color,
          opacity: 0.6,
          whiteSpace: "nowrap",
        }}
      >
        Mac Entertainment
      </div>
      <div
        style={{
          fontFamily: "var(--font-bruno-ace-sc,'Bruno Ace SC'),cursive",
          fontSize: `${8.5 * s}px`,
          letterSpacing: ".01em",
          color,
          opacity: 0.5,
          whiteSpace: "nowrap",
        }}
      >
        by Sonya Mac
      </div>
    </div>
  );
}
