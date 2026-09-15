"use client";
// PAIRS ROUND — NEW ROUND TYPE, DESIGN-ONLY PREVIEW.
//
// This file is intentionally standalone: not imported by any existing host
// page, display page, or round-type switch. It exists purely so the host
// can click through the branded look of a new round type before it's wired
// into real session state, scoring, or realtime sync. Nothing in the
// existing app (Hard Deck, Pursuit, Multi Tap, etc.) references this file,
// so nothing already working is touched by adding it.
//
// Mechanic: 3 "odd couple" picture pairs (things that go together
// conceptually, not visually identical — e.g. kettle + teacup). Player taps
// two tiles; correct pairs lock in and glow green, wrong pairs shake and
// reset. Mirrors NYT Connections' color-coded-groups feel but simplified to
// pairs instead of groups of four.
//
// PLACEHOLDER_PAIRS below use plain colour tiles standing in for real
// picture-question photos (the same pattern already used for Daily Games'
// Connections placeholder). Swapping in real photo URLs — either curated
// pairs from the question bank or freshly generated ones — is a content
// step for the prep-panel generation pipeline, not a rebuild of this UI.
// See the Codex build brief for what's still needed to make this live:
// round-type registration, session phase wiring, scoring, and a generation
// path that produces PAIRS of related images instead of one image per Q&A.

import { useState } from "react";

type PairTile = { id: string; pairId: string; label: string; glyph: string; bg: string };

const PLACEHOLDER_PAIRS: { pairId: string; a: { label: string; glyph: string; bg: string }; b: { label: string; glyph: string; bg: string } }[] = [
  { pairId: "p1", a: { label: "Kettle", glyph: "K", bg: "linear-gradient(155deg,#3a1a63,#1a0a33)" }, b: { label: "Teacup", glyph: "T", bg: "linear-gradient(155deg,#4a1a4d,#22091f)" } },
  { pairId: "p2", a: { label: "Umbrella", glyph: "U", bg: "linear-gradient(155deg,#123a5a,#081a2e)" }, b: { label: "Rain Cloud", glyph: "R", bg: "linear-gradient(155deg,#1a3a4a,#0a1a22)" } },
  { pairId: "p3", a: { label: "Needle", glyph: "N", bg: "linear-gradient(155deg,#4d2a1a,#221208)" }, b: { label: "Thread", glyph: "H", bg: "linear-gradient(155deg,#5a1a2a,#280910)" } },
];

function buildTiles(): PairTile[] {
  const tiles: PairTile[] = [];
  for (const set of PLACEHOLDER_PAIRS) {
    tiles.push({ id: set.pairId + "-a", pairId: set.pairId, label: set.a.label, glyph: set.a.glyph, bg: set.a.bg });
    tiles.push({ id: set.pairId + "-b", pairId: set.pairId, label: set.b.label, glyph: set.b.glyph, bg: set.b.bg });
  }
  const order = [3, 0, 5, 1, 4, 2];
  return order.map(i => tiles[i]);
}

// ---------- shared local demo state hook (host/display/player all mirror it) ----------
function usePairsDemo() {
  const [tiles] = useState<PairTile[]>(buildTiles);
  const [selected, setSelected] = useState<string[]>([]);
  const [solvedPairIds, setSolvedPairIds] = useState<string[]>([]);
  const [wrongFlash, setWrongFlash] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const done = solvedPairIds.length === PLACEHOLDER_PAIRS.length;

  function tap(tile: PairTile) {
    if (done || solvedPairIds.includes(tile.pairId) || selected.includes(tile.id) || wrongFlash.length > 0) return;
    const next = [...selected, tile.id];
    if (next.length < 2) { setSelected(next); return; }
    const first = tiles.find(t => t.id === next[0])!;
    const second = tiles.find(t => t.id === next[1])!;
    if (first.pairId === second.pairId) {
      setSolvedPairIds(prev => [...prev, first.pairId]);
      setSelected([]);
    } else {
      setWrongFlash(next);
      setMistakes(m => m + 1);
      setTimeout(() => { setWrongFlash([]); setSelected([]); }, 550);
    }
  }

  return { tiles, selected, solvedPairIds, wrongFlash, mistakes, done, tap };
}

// ---------- 1. HOST CONSOLE PREVIEW ----------
// Mock team progress - stands in for the real per-team realtime rows Codex
// will wire from the session's answer/score tables (same shape as Multi
// Tap's live team list).
const MOCK_TEAMS = [
  { name: "The Quizzards", solved: 2, mistakes: 1 },
  { name: "Pub Landlords", solved: 3, mistakes: 0 },
  { name: "No Idea FC", solved: 1, mistakes: 2 },
  { name: "Trivia Newton John", solved: 0, mistakes: 0 },
];

export function PairsHostConsolePreview({ onClose }: { onClose?: () => void }) {
  const demo = usePairsDemo();
  return (
    <div style={{ minHeight: "100vh", boxSizing: "border-box", background: "#0A0118", display: "flex", flexDirection: "column" }}>
      {/* Next-Action bar, matching every other round's host console (Pursuit,
          Hard Deck) - the host's next move is always the first thing on
          screen, not something to hunt for further down. */}
      <div style={{ flexShrink: 0, background: "linear-gradient(135deg,#be26c1,#7a1a7d)", padding: "14px 24px", display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ color: "rgba(255,255,255,.75)", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>NEXT ACTION</span>
        <span style={{ color: "#fff", fontSize: 16, fontWeight: 800 }}>End Pairs round &amp; reveal scores</span>
        <span style={{ marginLeft: "auto", color: "rgba(255,255,255,.7)", fontSize: 12, border: "1px solid rgba(255,255,255,.35)", borderRadius: 8, padding: "3px 10px" }}>Space ↵</span>
      </div>

      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "14px 24px 6px" }}>
        <div style={{ fontFamily: "'Bruno Ace SC', sans-serif", fontSize: 20, color: "#D94FDC", letterSpacing: 3 }}>PAIRS</div>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 999, padding: "3px 10px" }}>Design preview — not wired to live scoring</span>
        {onClose && (
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button onClick={onClose} style={{ padding: "6px 14px", borderRadius: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer" }}>Close</button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 32, padding: "10px 24px 40px" }}>
        <main style={{ flex: "2 1 480px" }}>
          <div style={{ color: "rgba(255,255,255,.55)", fontSize: 13, marginBottom: 16, textAlign: "center" }}>
            The three pairs this round — mirrors what's on the display board, so you can check the content at a glance.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, maxWidth: 620, margin: "0 auto" }}>
            {PLACEHOLDER_PAIRS.map(set => {
              const solved = demo.solvedPairIds.includes(set.pairId);
              return (
                <div key={set.pairId} style={{ border: solved ? "1px solid #2ee06e" : "1px solid rgba(255,255,255,.14)", borderRadius: 14, padding: "14px 12px", opacity: solved ? 1 : 0.85, textAlign: "center" }}>
                  <div style={{ color: solved ? "#2ee06e" : "rgba(255,255,255,.4)", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>{solved ? "SOLVED" : "LIVE"}</div>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{set.a.label}</div>
                  <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, margin: "4px 0" }}>+</div>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{set.b.label}</div>
                </div>
              );
            })}
          </div>
        </main>
        <aside style={{ flex: "1 1 260px" }}>
          <div style={{ color: "rgba(255,255,255,.85)", fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>TEAM PROGRESS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {MOCK_TEAMS.slice().sort((a, b) => b.solved - a.solved).map(team => (
              <div key={team.name} style={{ border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{team.name}</div>
                  <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, marginTop: 2 }}>{team.mistakes} mistake{team.mistakes === 1 ? "" : "s"}</div>
                </div>
                <div style={{ color: team.solved === 3 ? "#2ee06e" : "#ffc533", fontSize: 15, fontWeight: 800 }}>{team.solved}/3</div>
              </div>
            ))}
          </div>
          <div style={{ color: "rgba(255,255,255,.4)", fontSize: 11, lineHeight: 1.6, marginTop: 14 }}>
            Scoring will follow the same per-pair award pattern as Multi Tap once wired to real session state.
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---------- 2. DISPLAY SCREEN PREVIEW ----------
export function PairsDisplayPreview() {
  const demo = usePairsDemo();
  return (
    <div style={{ minHeight: "100vh", background: "#0A0118", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 16px" }}>
      <div style={{ color: "#cfc2e7", fontSize: 14, letterSpacing: 2, fontWeight: 700 }}>PAIRS ROUND</div>
      <div style={{ color: "#fff", fontSize: "clamp(32px,4vw,56px)", textAlign: "center", fontWeight: 800, margin: "8px 0 32px" }}>Find the three pairs</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "clamp(16px,2vw,32px)" }}>
        {PLACEHOLDER_PAIRS.map(set => {
          const solved = demo.solvedPairIds.includes(set.pairId);
          return (
            <div key={set.pairId} style={{
              width: "clamp(140px,14vw,220px)", height: "clamp(140px,14vw,220px)", borderRadius: 24,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: solved ? "3px solid #2ee06e" : "2px dashed rgba(255,255,255,.2)",
              background: solved ? "rgba(46,224,110,.08)" : "rgba(255,255,255,.03)",
              color: solved ? "#2ee06e" : "rgba(255,255,255,.3)", fontSize: "clamp(14px,1.4vw,20px)", fontWeight: 800,
            }}>
              {solved ? "MATCHED" : "?"}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- 3. PLAYER HANDSET PREVIEW ----------
export function PairsPlayerPreview() {
  const demo = usePairsDemo();
  return (
    <div style={{ minHeight: "100dvh", background: "radial-gradient(ellipse 90% 50% at 50% 15%,rgba(190,38,193,.13),transparent 70%),#090116", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px" }}>
      <div style={{ fontFamily: "'Bruno Ace SC', sans-serif", color: "#ffc533", fontSize: 15, letterSpacing: 2, marginTop: 8 }}>PAIRS</div>
      <div style={{ color: "#cfc2e7", fontSize: 12, marginTop: 2, marginBottom: 14 }}>Tap two that go together</div>

      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ width: 9, height: 9, borderRadius: 5, background: i < demo.mistakes ? "#e0483b" : "rgba(255,255,255,.12)" }} />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, width: "100%", maxWidth: 340 }}>
        {demo.tiles.map(tile => {
          const isSolved = demo.solvedPairIds.includes(tile.pairId);
          const isSelected = demo.selected.includes(tile.id);
          const isWrong = demo.wrongFlash.includes(tile.id);
          return (
            <button
              key={tile.id}
              onClick={() => demo.tap(tile)}
              disabled={isSolved}
              style={{
                aspectRatio: "1", borderRadius: 20, border: isSelected ? "3px solid #be26c1" : isSolved ? "3px solid #2ee06e" : "1px solid rgba(255,255,255,.14)",
                background: tile.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 8, cursor: isSolved ? "default" : "pointer", opacity: isSolved ? 0.45 : 1,
                minHeight: 64,
                animation: isWrong ? "qi-pairs-shake .5s" : undefined,
                transition: "opacity .3s, border-color .2s",
              }}
            >
              <span style={{ color: "#fff", fontSize: 28, fontWeight: 800, opacity: 0.9 }}>{tile.glyph}</span>
              <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, opacity: 0.85 }}>{tile.label}</span>
            </button>
          );
        })}
      </div>

      {demo.done && (
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <div style={{ color: "#2ee06e", fontWeight: 800, fontSize: 18 }}>All matched! 🎉</div>
          <div style={{ color: "#cfc2e7", fontSize: 13, marginTop: 4 }}>{demo.mistakes} mistake{demo.mistakes === 1 ? "" : "s"}</div>
        </div>
      )}

      <style>{`@keyframes qi-pairs-shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }`}</style>
    </div>
  );
}
