"use client";
// PAIRS ROUND - design-only preview route.
//
// Not linked from any nav, host workflow, or existing page - visit directly
// at /host/pairs-preview. Purely for viewing the branded look of a new round
// type before Codex wires it into real session state and scoring. Safe to
// delete once the design is approved and the real build starts.

import { useState } from "react";
import { PairsHostConsolePreview, PairsDisplayPreview, PairsPlayerPreview } from "@/components/PairsPanelPreview";

export default function PairsPreviewPage() {
  const [view, setView] = useState<"host" | "display" | "player">("player");

  return (
    <div style={{ minHeight: "100vh", background: "#0A0118" }}>
      <div style={{ position: "fixed", top: 12, left: 12, zIndex: 300, display: "flex", gap: 8 }}>
        {(["player", "display", "host"] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700, letterSpacing: 1,
              cursor: "pointer", textTransform: "uppercase",
              background: view === v ? "#be26c1" : "rgba(255,255,255,.08)",
              color: view === v ? "#fff" : "rgba(255,255,255,.6)",
              border: "1px solid rgba(255,255,255,.15)",
            }}
          >
            {v}
          </button>
        ))}
      </div>

      {view === "host" && <PairsHostConsolePreview />}
      {view === "display" && <PairsDisplayPreview />}
      {view === "player" && <PairsPlayerPreview />}
    </div>
  );
}
