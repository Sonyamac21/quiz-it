/* eslint-disable @next/next/no-img-element -- These small local SVG flags need no raster image optimisation. */
import { countryPoints, type CountryQuestionFields } from "@/lib/quiz/countryRound";

export function CountryClues({ question, index, preview = false, compact = false }: { question: CountryQuestionFields; index?: number; preview?: boolean; compact?: boolean }) {
  const shown = Math.max(0, Math.min(4, index ?? question.country_clue_index ?? 0));
  const clues = (question.country_clues || []).slice(0, preview ? 5 : shown + 1);
  return <section aria-label="Country clues" style={{ margin: compact ? "8px 0" : "12px 6%", fontSize: compact ? 14 : "clamp(16px, 2vw, 28px)" }}>
    <div style={{ color: "#FFC533", fontWeight: 800, marginBottom: 8 }}>{preview ? "5 clues · 10 → 8 → 6 → 4 → 2 points" : `Clue ${shown + 1} of 5 · ${countryPoints(shown)} points`}</div>
    <ol style={{ margin: 0, paddingLeft: "1.5em", display: "grid", gap: compact ? 5 : 10 }}>
      {clues.map((clue, i) => <li key={i} style={{ color: preview || i === shown ? "#fff" : "#C9BDDE", lineHeight: 1.35 }}>
        {clue}
        {question.country_flag_src && question.country_flag_clue_index === i && <img src={question.country_flag_src} alt="Flag clue" width={180} height={110} style={{ display: "block", width: compact ? 120 : "clamp(120px, 15vw, 220px)", height: "auto", maxHeight: compact ? 80 : 140, objectFit: "contain", border: "1px solid #9C91AD", marginTop: 6 }} />}
      </li>)}
    </ol>
    <p style={{ fontSize: compact ? 12 : "0.65em", color: "#B9A8D9", margin: "10px 0 0" }}>One guess per country. Wait for another clue or lock in your answer.</p>
  </section>;
}
