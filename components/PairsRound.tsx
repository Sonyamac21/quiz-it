"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  PAIRS_PER_ROUND,
  PairRecord,
  PairsProgress,
  PairTile,
  pairProgressForTeam,
  readPairs,
  readPairsProgress,
  tilesForTeam,
} from "@/lib/quiz/pairs";

const shell = "radial-gradient(ellipse 70% 55% at 50% 20%,rgba(190,38,193,.16),transparent 70%),#090116";

export function PairsDisplayBoard({ pairs, progress, teamNames }: { pairs: PairRecord[]; progress: PairsProgress; teamNames: string[] }) {
  const allSolved = (pairId: string) => teamNames.length > 0 && teamNames.every(name => pairProgressForTeam(progress, name).solved_pair_ids.includes(pairId));
  const completed = teamNames.filter(name => pairProgressForTeam(progress, name).solved_pair_ids.length >= PAIRS_PER_ROUND).length;
  return (
    <div style={{ height: "100%", width: "100%", boxSizing: "border-box", background: shell, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "clamp(24px,4vh,64px)" }}>
      <div style={{ color: "#d94fdc", font: "700 clamp(15px,1.3vw,24px) 'Inter'", letterSpacing: ".22em" }}>MATCH MADE ROUND</div>
      <h1 style={{ color: "white", font: "800 clamp(36px,5vw,84px) 'Inter'", margin: ".15em 0 .5em", textAlign: "center" }}>Find the three pairs</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(150px,1fr))", gap: "clamp(18px,2.4vw,42px)", width: "min(78vw,1120px)" }}>
        {pairs.map((pair, index) => {
          const solved = allSolved(pair.pair_id);
          return <div key={pair.pair_id} style={{ aspectRatio: "1.15", borderRadius: "clamp(18px,2vw,30px)", border: solved ? "3px solid #2ee06e" : "2px dashed rgba(255,255,255,.24)", background: solved ? "rgba(46,224,110,.1)" : "rgba(255,255,255,.035)", display: "grid", placeItems: "center", boxShadow: solved ? "0 0 38px rgba(46,224,110,.18)" : "none" }}>
            <div style={{ textAlign: "center" }}><div style={{ color: solved ? "#2ee06e" : "rgba(255,255,255,.28)", font: "900 clamp(34px,4vw,68px) 'Inter'" }}>{solved ? "✓" : index + 1}</div><div style={{ color: solved ? "#2ee06e" : "rgba(255,255,255,.5)", font: "800 clamp(14px,1.4vw,23px) 'Inter'", letterSpacing: ".12em" }}>{solved ? "MATCHED" : "IN PLAY"}</div></div>
          </div>;
        })}
      </div>
      <div style={{ marginTop: "clamp(24px,4vh,52px)", color: "#cfc2e7", font: "700 clamp(16px,1.6vw,27px) 'Inter'" }}>{completed} of {teamNames.length} teams complete</div>
    </div>
  );
}

export function PairsPlayerBoard({ pairs, progress, teamName, disabled, onSelect, onAttempt }: { pairs: PairRecord[]; progress: PairsProgress; teamName: string; disabled?: boolean; onSelect: (tile: PairTile) => Promise<void>; onAttempt: (first: PairTile, second: PairTile) => Promise<{ correct: boolean; reason?: string }> }) {
  const tiles = useMemo(() => tilesForTeam(pairs, teamName), [pairs, teamName]);
  const mine = pairProgressForTeam(progress, teamName);
  const [selected, setSelected] = useState<PairTile[]>([]);
  const [wrong, setWrong] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const restoredSelectionRef = useRef<string | null>(null);
  const solved = new Set(mine.solved_pair_ids);
  const done = solved.size >= PAIRS_PER_ROUND;
  useEffect(() => {
    if (!mine.selected_tile_id || selected.length > 0 || restoredSelectionRef.current === mine.selected_tile_id) return;
    const restored = tiles.find(tile => tile.id === mine.selected_tile_id && !solved.has(tile.pair_id));
    if (restored) { restoredSelectionRef.current = restored.id; setSelected([restored]); }
  }, [mine.selected_tile_id, selected.length, solved, tiles]);

  async function tap(tile: PairTile) {
    if (disabled || busy || done || solved.has(tile.pair_id) || selected.some(item => item.id === tile.id)) return;
    if (selected.length === 0) { restoredSelectionRef.current = tile.id; setSelected([tile]); void onSelect(tile); return; }
    const first = selected[0];
    setSelected([first, tile]); setBusy(true); setMessage("");
    const result = await onAttempt(first, tile);
    if (!result.correct) {
      setWrong([first.id, tile.id]);
      window.setTimeout(() => { setWrong([]); setSelected([]); }, 550);
    } else setSelected([]);
    if (result.reason && !["ok", "wrong-pair", "already-solved"].includes(result.reason)) setMessage("That match was not confirmed. Tap it again.");
    setBusy(false);
  }

  return <div style={{ height: "100dvh", overflow: "hidden", background: shell, boxSizing: "border-box", padding: "max(12px,env(safe-area-inset-top)) 14px max(10px,env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", alignItems: "center" }}>
    <div style={{ color: "#ffc533", font: "700 clamp(15px,2.1vh,20px) 'Inter'", letterSpacing: ".18em", marginTop: 4 }}>MATCH MADE</div>
    <div style={{ color: "#cfc2e7", font: "600 clamp(13px,1.8vh,17px) 'Inter'", margin: "3px 0 8px" }}>{done ? "All three matched!" : "Tap two pictures that go together"}</div>
    <div style={{ display: "flex", gap: 7, marginBottom: 9 }} aria-label={`${mine.mistakes} mistakes`}>
      {Array.from({ length: Math.max(4, mine.mistakes) }).map((_, i) => <span key={i} style={{ width: 9, height: 9, borderRadius: 9, background: i < mine.mistakes ? "#e0483b" : "rgba(255,255,255,.15)" }} />)}
    </div>
    <div style={{ flex: 1, minHeight: 0, width: "min(100%,430px)", display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "repeat(3,minmax(0,1fr))", gap: "clamp(8px,1.4vh,13px)" }}>
      {tiles.map(tile => {
        const isSolved = solved.has(tile.pair_id), isSelected = selected.some(item => item.id === tile.id), isWrong = wrong.includes(tile.id);
        return <button key={tile.id} type="button" onClick={() => void tap(tile)} disabled={disabled || isSolved || busy} style={{ minHeight: 0, overflow: "hidden", position: "relative", borderRadius: "clamp(14px,2.2vh,22px)", border: isSolved ? "3px solid #2ee06e" : isSelected ? "3px solid #d94fdc" : "1px solid rgba(255,255,255,.18)", padding: 0, background: "#170b2c", opacity: isSolved ? .58 : 1, boxShadow: isSelected ? "0 0 20px rgba(217,79,220,.45)" : "none", animation: isWrong ? "qi-pairs-shake .5s" : undefined }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src={tile.image_url} alt={tile.label} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <span style={{ position: "absolute", inset: "auto 0 0", padding: "7px 5px", background: "linear-gradient(transparent,rgba(5,0,14,.96))", color: "white", font: "800 clamp(12px,1.7vh,16px) 'Inter'", textShadow: "0 1px 3px #000" }}>{tile.label}</span>
          {isSolved && <span style={{ position: "absolute", top: 7, right: 7, width: 27, height: 27, borderRadius: 20, display: "grid", placeItems: "center", background: "#2ee06e", color: "#06150c", fontWeight: 900 }}>✓</span>}
        </button>;
      })}
    </div>
    <div style={{ minHeight: 24, paddingTop: 5, color: message ? "#ff7d87" : done ? "#2ee06e" : "rgba(255,255,255,.5)", font: "700 12px 'Inter'" }}>{message || (done ? `${mine.mistakes} mistake${mine.mistakes === 1 ? "" : "s"}` : `${solved.size} / ${PAIRS_PER_ROUND} matched`)}</div>
    <style>{`@keyframes qi-pairs-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}`}</style>
  </div>;
}

type HostProps = { sessionId: string; sessionPin: string; teams: { team_name: string }[]; rounds: { id: string; name: string; questions: unknown[] }[]; autoStartRoundId?: string | null; onActiveChange?: (active: boolean) => void; onRoundComplete?: () => void; onScoreChange?: () => void };

export function PairsPanel({ sessionId, sessionPin, teams, rounds, autoStartRoundId, onActiveChange, onRoundComplete, onScoreChange }: HostProps) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [open, setOpen] = useState(false);
  const [roundId, setRoundId] = useState("");
  const [pairs, setPairs] = useState<PairRecord[]>([]);
  const [progress, setProgress] = useState<PairsProgress>({});
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const finishingRef = useRef(false);
  const lastStartRef = useRef<string | null>(null);
  const teamNames = useMemo(() => teams.map(team => team.team_name), [teams]);

  const hydrate = useCallback((row: Record<string, unknown>) => {
    setPairs(readPairs(row.pairs_content)); setProgress(readPairsProgress(row.pairs_progress)); setStatus(String(row.pairs_status || "idle"));
  }, []);
  useEffect(() => { onActiveChange?.(open); }, [open, onActiveChange]);
  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase.channel(`pairs-host-${sessionId}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` }, payload => hydrate(payload.new as Record<string, unknown>)).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [hydrate, sessionId, supabase]);

  const start = useCallback(async (id: string) => {
    const round = rounds.find(item => item.id === id);
    const content = readPairs(round?.questions);
    if (!round || content.length !== PAIRS_PER_ROUND) { setError("This Match Made round needs exactly three complete image pairs before it can go live."); setOpen(true); return; }
    const initial = Object.fromEntries(teamNames.map(name => [name, { solved_pair_ids: [], mistakes: 0, selected_tile_id: null }]));
    const { error: writeError } = await supabase.from("sessions").update({ phase: "pairs", pairs_status: "live", pairs_content: content, pairs_progress: initial, pairs_round_id: id, timer_started_at: null, current_question: null, allow_power_cards: false }).eq("id", sessionId);
    if (writeError) { setError("Could not start Match Made: " + writeError.message); setOpen(true); return; }
    setRoundId(id); setPairs(content); setProgress(initial); setStatus("live"); setError(""); setOpen(true);
  }, [rounds, sessionId, supabase, teamNames]);
  useEffect(() => {
    if (!autoStartRoundId) { lastStartRef.current = null; return; }
    if (lastStartRef.current === autoStartRoundId) return;
    lastStartRef.current = autoStartRoundId; void start(autoStartRoundId);
  }, [autoStartRoundId, start]);

  const rows = teamNames.map(name => ({ name, ...pairProgressForTeam(progress, name) })).sort((a, b) => b.solved_pair_ids.length - a.solved_pair_ids.length || a.mistakes - b.mistakes);
  const everyoneDone = rows.length > 0 && rows.every(row => row.solved_pair_ids.length >= PAIRS_PER_ROUND);
  useEffect(() => { if (everyoneDone && status === "live") void supabase.from("sessions").update({ pairs_status: "complete" }).eq("id", sessionId); }, [everyoneDone, sessionId, status, supabase]);

  async function finish() {
    if (finishingRef.current) return; finishingRef.current = true;
    const { error: writeError } = await supabase.from("sessions").update({ pairs_status: "complete" }).eq("id", sessionId);
    if (writeError) { setError("Could not finish Match Made: " + writeError.message); finishingRef.current = false; return; }
    setOpen(false); onScoreChange?.(); onRoundComplete?.(); finishingRef.current = false;
  }
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if ((event.code === "Space" || event.key === " ") && !event.repeat) { event.preventDefault(); void finish(); } };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  });
  if (!open || typeof document === "undefined") return null;
  return createPortal(<div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "#0a0118", color: "white", display: "flex", flexDirection: "column" }}>
    <button onClick={() => void finish()} style={{ flexShrink: 0, border: 0, background: "linear-gradient(135deg,#be26c1,#7a1a7d)", color: "white", padding: "14px 24px", display: "flex", alignItems: "center", gap: 14, textAlign: "left", cursor: "pointer" }}><small style={{ letterSpacing: ".12em", opacity: .75 }}>NEXT ACTION</small><strong>{everyoneDone || status === "complete" ? "Continue to round scores" : "End Match Made round early"}</strong><span style={{ marginLeft: "auto", border: "1px solid rgba(255,255,255,.4)", padding: "4px 10px", borderRadius: 8 }}>Space ↵</span></button>
    {error && <div role="alert" style={{ padding: 10, textAlign: "center", color: "#ff7d87" }}>{error}</div>}
    <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(280px,1fr)", gap: 24, padding: 22 }}>
      <main style={{ minWidth: 0 }}><div style={{ font: "700 18px 'Inter'", color: "#d94fdc", letterSpacing: ".18em", marginBottom: 12 }}>MATCH MADE</div><div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12, height: "calc(100% - 38px)" }}>{pairs.map(pair => <div key={pair.pair_id} style={{ minHeight: 0, border: "1px solid rgba(255,255,255,.16)", borderRadius: 18, overflow: "hidden", display: "grid", gridTemplateRows: "1fr 1fr" }}>{[pair.a, pair.b].map(item => <div key={item.label} style={{ position: "relative", minHeight: 0 }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={item.image_url} alt={item.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} /><strong style={{ position: "absolute", inset: "auto 0 0", padding: "18px 10px 8px", background: "linear-gradient(transparent,rgba(0,0,0,.9))", textAlign: "center" }}>{item.label}</strong></div>)}</div>)}</div></main>
      <aside style={{ minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}><div style={{ font: "700 13px 'Inter'", color: "#cfc2e7", letterSpacing: ".15em", marginBottom: 10 }}>TEAM PROGRESS · {rows.filter(r => r.solved_pair_ids.length === 3).length}/{rows.length} COMPLETE</div><div style={{ display: "grid", gridTemplateColumns: rows.length > 32 ? "repeat(3,minmax(0,1fr))" : rows.length > 16 ? "repeat(2,minmax(0,1fr))" : "1fr", gap: rows.length > 32 ? 4 : 7, minHeight: 0, overflow: "hidden" }}>{rows.map(row => <div key={row.name} style={{ minWidth: 0, border: "1px solid rgba(255,255,255,.13)", borderRadius: rows.length > 32 ? 8 : 11, padding: rows.length > 32 ? "4px 6px" : "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}><div style={{ minWidth: 0 }}><strong title={row.name} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: rows.length > 32 ? 10 : 13 }}>{row.name}</strong><div style={{ color: "rgba(255,255,255,.45)", fontSize: rows.length > 32 ? 8 : 10 }}>{row.mistakes} mistake{row.mistakes === 1 ? "" : "s"}</div></div><b style={{ flexShrink: 0, color: row.solved_pair_ids.length === 3 ? "#2ee06e" : "#ffc533", fontSize: rows.length > 32 ? 11 : 16 }}>{row.solved_pair_ids.length}/3</b></div>)}</div></aside>
    </div>
  </div>, document.body);
}
