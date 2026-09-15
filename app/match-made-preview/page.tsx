"use client";
// MATCH MADE - design-only preview route (formerly "Pairs" during design).
//
// Deliberately lives OUTSIDE /host - the /host/layout.tsx wraps every route
// under it in BackOfficeShell (the real site header/nav). Root layout has
// no wrapper, so this route renders clean and full-screen.
//
// Not linked from any nav or host workflow - visit directly at
// /match-made-preview. Purely for viewing the branded look of a new round
// type before Codex wires it into real session state and scoring. Safe to
// delete once the design is approved and the real build starts.

import { useState } from "react";
import { MatchMadeHostConsolePreview, MatchMadeDisplayPreview, MatchMadePlayerPreview } from "@/components/MatchMadePanelPreview";

export default function MatchMadePreviewPage() {
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

      {view === "host" && <MatchMadeHostConsolePreview />}
      {view === "display" && <MatchMadeDisplayPreview />}
      {view === "player" && <MatchMadePlayerPreview />}
    </div>
  );
}
