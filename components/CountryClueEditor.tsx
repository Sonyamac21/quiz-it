import { COUNTRY_FLAGS, COUNTRY_POINTS } from "@/lib/quiz/countryRound";

export function CountryClueEditor({ draft, onChange }: {
  draft: Record<string, string>;
  onChange: (field: string, value: string) => void;
}) {
  return <div style={{ display: "grid", gap: 8 }}>
    {COUNTRY_POINTS.map((points, index) => <label key={index}>
      Clue {index + 1} · {points} points
      <textarea className="fbh-input" aria-label={`Clue ${index + 1}`}
        value={draft[`country_clue_${index}`] || ""}
        onChange={event => onChange(`country_clue_${index}`, event.target.value)} />
    </label>)}
    <label>Flag clue (optional)
      <select className="fbh-input" aria-label="Flag clue" value={draft.country_flag_src || ""}
        onChange={event => onChange("country_flag_src", event.target.value)}>
        <option value="">No flag</option>
        {COUNTRY_FLAGS.map(flag => <option key={flag.src} value={flag.src}>{flag.country}</option>)}
      </select>
    </label>
    {draft.country_flag_src && <label>Show flag with
      <select className="fbh-input" aria-label="Show flag with clue" value={draft.country_flag_clue_index ?? "3"}
        onChange={event => onChange("country_flag_clue_index", event.target.value)}>
        {COUNTRY_POINTS.map((points, index) => <option key={index} value={index}>Clue {index + 1} · {points} points</option>)}
      </select>
    </label>}
    <label>Other accepted names (comma separated)
      <input className="fbh-input" value={draft.country_aliases_text || ""}
        onChange={event => onChange("country_aliases_text", event.target.value)} />
    </label>
  </div>;
}
