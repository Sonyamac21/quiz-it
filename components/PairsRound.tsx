"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMediaUrl } from "@/lib/getMediaUrl";
import {
  PAIRS_PER_ROUND,
  PairRecord,
  PairsProgress,
  PairTile,
  pairProgressForTeam,
  readPairs,
  readPairsQuestions,
  pairsForQuestion,
  readPairsProgress,
  tilesForTeam,
  fastestPairsTeam,
} from "@/lib/quiz/pairs";

const shell = "radial-gradient(ellipse 70% 55% at 50% 20%,rgba(190,38,193,.16),transparent 70%),#090116";

export function PairsDisplayBoard({ pairs, progress, teamNames, complete = false }: { pairs: PairRecord[]; progress: PairsProgress; teamNames: string[]; complete?: boolean }) {
  const tiles = complete ? [...pairs.map(p => ({ ...p.a, id: p.pair_id + "-a" })), ...pairs.map(p => ({ ...p.b, id: p.pair_id + "-b" }))] : tilesForTeam(pairs, "venue-display");
  const fastest = fastestPairsTeam(progress);
  const completed = teamNames.filter(name => pairProgressForTeam(progress, name).solved_pair_ids.length >= PAIRS_PER_ROUND).length;
  return (
    <div style={{ height: "100%", width: "100%", boxSizing: "border-box", background: shell, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "clamp(24px,4vh,64px)" }}>
      <div style={{ color: "#d94fdc", font: "700 clamp(15px,1.3vw,24px) 'Inter'", letterSpacing: ".22em" }}>MATCH MADE ROUND</div>
      <h1 style={{ color: "white", font: "800 clamp(36px,5vw,84px) 'Inter'", margin: ".15em 0 .5em", textAlign: "center" }}>{complete ? "The matching pairs" : "Find the three pairs"}</h1>
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gridTemplateRows: "repeat(2,minmax(0,1fr))", gap: "clamp(12px,2vh,24px)", width: "min(86vw,1400px)" }}>
        {tiles.map(tile => <div key={tile.id} style={{ position: "relative", minHeight: 0, overflow: "hidden", borderRadius: 18, border: "2px solid #493060" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src={getMediaUrl(tile.image_url) || undefined} alt={tile.label} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          <strong style={{ position: "absolute", inset: "auto 0 0", padding: "20px 12px 10px", color: "white", textAlign: "center", fontSize: "clamp(20px,2vw,34px)", background: "linear-gradient(transparent,rgba(0,0,0,.95))" }}>{tile.label}</strong>
        </div>)}
      </div>
      <div style={{ marginTop: "2vh", color: "#cfc2e7", font: "700 clamp(16px,1.6vw,27px) 'Inter'" }}>{completed} of {teamNames.length} teams complete{fastest ? ` · First complete: ${fastest}` : ""}</div>
    </div>
  );
}

export function PairsPlayerBoard({ pairs, progress, teamName, points, disabled, onSelect, onAttempt }: { pairs: PairRecord[]; progress: PairsProgress; teamName: string; points?: number; disabled?: boolean; onSelect: (tile: PairTile) => Promise<void>; onAttempt: (first: PairTile, second: PairTile) => Promise<{ correct: boolean; reason?: string }> }) {
  const tiles = useMemo(() => tilesForTeam(pairs, teamName), [pairs, teamName]);
  const mine = pairProgressForTeam(progress, teamName);
  const [selected, setSelected] = useState<PairTile[]>([]);
  const [wrong, setWrong] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const restoredSelectionRef = useRef<string | null>(null);
  const attemptRef = useRef(false);
  const solved = new Set(mine.solved_pair_ids);
  const done = solved.size >= PAIRS_PER_ROUND;
  useEffect(() => {
    if (!mine.selected_tile_id || selected.length > 0 || restoredSelectionRef.current === mine.selected_tile_id) return;
    const restored = tiles.find(tile => tile.id === mine.selected_tile_id && !solved.has(tile.pair_id));
    if (restored) { restoredSelectionRef.current = restored.id; setSelected([restored]); }
  }, [mine.selected_tile_id, selected.length, solved, tiles]);

  async function tap(tile: PairTile) {
    if (disabled || attemptRef.current || busy || done || solved.has(tile.pair_id) || selected.some(item => item.id === tile.id)) return;
    attemptRef.current = true;
    setBusy(true); setMessage("");
    try {
    if (selected.length === 0) { restoredSelectionRef.current = tile.id; setSelected([tile]); await onSelect(tile); return; }
    const first = selected[0];
    setSelected([first, tile]); setBusy(true); setMessage("");
    const result = await onAttempt(first, tile);
    if (result.reason === "wrong-pair") {
      setWrong([first.id, tile.id]);
      await new Promise(resolve => window.setTimeout(resolve, 550));
      setWrong([]); setSelected([]);
    } else setSelected([]);
    if (result.reason && !["ok", "wrong-pair", "already-solved"].includes(result.reason)) setMessage("That match was not confirmed. Tap it again.");
    } catch { setSelected([]); setMessage("Connection interrupted. Your confirmed points are safe. Try again."); }
    finally { setBusy(false); attemptRef.current = false; }
  }

  return <div style={{ height: "100dvh", overflow: "hidden", background: shell, boxSizing: "border-box", padding: "max(12px,env(safe-area-inset-top)) 14px max(10px,env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", alignItems: "center" }}>
    <div style={{ color: "#ffc533", font: "700 clamp(15px,2.1vh,20px) 'Inter'", letterSpacing: ".18em", marginTop: 4 }}>MATCH MADE</div>
    <div style={{ color: "#cfc2e7", font: "600 clamp(13px,1.8vh,17px) 'Inter'", margin: "3px 0 4px" }}>{done ? "All three matched!" : "Tap two pictures that go together"}</div>
    {points !== undefined && <div style={{ color: "#d94fdc", font: "800 15px 'Inter'", marginBottom: 5 }}>Team total: {points} pts</div>}
    <div style={{ display: "flex", gap: 7, marginBottom: 9 }} aria-label={`${mine.mistakes} mistakes`}>
      <span style={{ color: "#cfc2e7", fontSize: 15 }}>{mine.mistakes} mistakes · +{solved.size} points this question</span>
    </div>
    <div style={{ flex: 1, minHeight: 0, width: "min(100%,430px)", display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "repeat(3,minmax(0,1fr))", gap: "clamp(8px,1.4vh,13px)" }}>
      {tiles.map(tile => {
        const isSolved = solved.has(tile.pair_id), isSelected = selected.some(item => item.id === tile.id), isWrong = wrong.includes(tile.id);
        return <button key={tile.id} type="button" onClick={() => void tap(tile)} disabled={disabled || isSolved || busy} style={{ minHeight: 0, overflow: "hidden", position: "relative", borderRadius: "clamp(14px,2.2vh,22px)", border: isSolved ? "3px solid #2ee06e" : isSelected ? "3px solid #d94fdc" : "1px solid rgba(255,255,255,.18)", padding: 0, background: "#170b2c", opacity: isSolved ? .58 : 1, boxShadow: isSelected ? "0 0 20px rgba(217,79,220,.45)" : "none", animation: isWrong ? "qi-pairs-shake .5s" : undefined }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src={getMediaUrl(tile.image_url) || undefined} alt={tile.label} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
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
  const [questionIndex, setQuestionIndex] = useState(0);
  const [pairs, setPairs] = useState<PairRecord[]>([]);
  const [progress, setProgress] = useState<PairsProgress>({});
  const [status, setStatus] = useState("idle");
  const [scoreboard, setScoreboard] = useState<{team_name:string; total_points:number; round_points?:number}[]>([]);
  const fastestTeam = fastestPairsTeam(progress);
  const [error, setError] = useState("");
  const finishingRef = useRef(false);
  const lastStartRef = useRef<string | null>(null);
  const revisionRef = useRef(0);
  const teamNames = useMemo(() => teams.map(team => team.team_name), [teams]);

  const hydrate = useCallback((row: Record<string, unknown>) => {
    const revision = Date.parse(String(row.updated_at || ""));
    if (Number.isFinite(revision) && revision < revisionRef.current) return;
    if (Number.isFinite(revision)) revisionRef.current = revision;
    if (row.phase !== "pairs") { setOpen(false); return; }
    setRoundId(String(row.pairs_round_id || ""));
    setQuestionIndex(Number(row.current_question_index) || 0);
    setOpen(true);
    setPairs(readPairs(row.pairs_content)); setProgress(readPairsProgress(row.pairs_progress)); setStatus(String(row.pairs_status || "idle"));
    if (Array.isArray(row.scoreboard_data)) setScoreboard(row.scoreboard_data as {team_name:string; total_points:number; round_points?:number}[]);
  }, []);
  useEffect(() => { onActiveChange?.(open); }, [open, onActiveChange]);
  useEffect(() => {
    if (!sessionId) return;
    revisionRef.current = 0;
    let reading = false;
    const refresh = async () => {
      if (reading) return;
      reading = true;
      try {
        const { data } = await supabase.from("sessions").select("updated_at,phase,pairs_round_id,current_question_index,pairs_content,pairs_progress,pairs_status,scoreboard_data").eq("id", sessionId).single();
        if (data) hydrate(data);
      } finally { reading = false; }
    };
    void refresh();
    void supabase.from("scores").select("team_name,total_points,round_points").eq("session_pin", sessionPin).then(({ data }) => { if (data) setScoreboard(previous => previous.length ? previous : data); });
    const repair = window.setInterval(() => void refresh(), 5000);
    const channel = supabase.channel(`pairs-host-${sessionId}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` }, payload => hydrate(payload.new as Record<string, unknown>)).subscribe();
    return () => { window.clearInterval(repair); void supabase.removeChannel(channel); };
  }, [hydrate, sessionId, sessionPin, supabase]);

  const start = useCallback(async (id: string, index = 0): Promise<boolean> => {
    const round = rounds.find(item => item.id === id);
    if (index === 0) {
      const { data: saved, error: readError } = await supabase.from("sessions").select("phase,pairs_round_id,current_question_index,pairs_content,pairs_progress,pairs_status,scoreboard_data").eq("id", sessionId).single();
      if (readError) { setError(readError.message); setOpen(true); return false; }
      if (saved?.phase === "pairs" && saved.pairs_round_id === id) { hydrate(saved); return true; }
    }
    const content = pairsForQuestion(round?.questions, index);
    if (!round || content.length !== PAIRS_PER_ROUND) { setError("This Match Made question needs exactly three complete image pairs before it can go live."); setOpen(true); return false; }
    const initial = Object.fromEntries(teamNames.map(name => [name, { solved_pair_ids: [], mistakes: 0, selected_tile_id: null }]));
    const { error: writeError } = await supabase.from("sessions").update({ phase: "pairs", current_question_index: index, pairs_status: "live", pairs_content: content, pairs_progress: initial, pairs_round_id: id, timer_started_at: null, current_question: null, allow_power_cards: false, spin_choice: null, spin_offered: false, fastest_team: null, updated_at: new Date().toISOString() }).eq("id", sessionId);
    if (writeError) { setError("Could not start Match Made: " + writeError.message); setOpen(true); return false; }
    setQuestionIndex(index);
    setRoundId(id); setPairs(content); setProgress(initial); setStatus("live"); setError(""); setOpen(true);
    return true;
  }, [rounds, sessionId, supabase, teamNames, hydrate]);
  useEffect(() => {
    if (!autoStartRoundId) { lastStartRef.current = null; return; }
    if (lastStartRef.current === autoStartRoundId) return;
    lastStartRef.current = autoStartRoundId; void start(autoStartRoundId);
  }, [autoStartRoundId, start]);

  const rows = teamNames.map(name => ({ name, ...pairProgressForTeam(progress, name) }));
  const everyoneDone = rows.length > 0 && rows.every(row => row.solved_pair_ids.length >= PAIRS_PER_ROUND);
  useEffect(() => { if (everyoneDone && status === "live") void supabase.from("sessions").update({ pairs_status: "complete" }).eq("id", sessionId).eq("current_question_index", questionIndex).eq("pairs_round_id", roundId); }, [everyoneDone, sessionId, status, supabase, questionIndex, roundId]);

  async function finish() {
    if (finishingRef.current) return; finishingRef.current = true;
    if (status === "live") {
      try {
        const { error: writeError } = await supabase.from("sessions").update({ pairs_status: "complete", updated_at: new Date().toISOString() }).eq("id", sessionId).eq("pairs_round_id", roundId).eq("current_question_index", questionIndex);
        if (writeError) setError("Could not reveal results: " + writeError.message);
        else { setStatus("complete"); onScoreChange?.(); }
      } finally { finishingRef.current = false; }
      return;
    }
    const total = readPairsQuestions(rounds.find(r => r.id === roundId)?.questions).length;
    if (questionIndex + 1 < total) {
      try { await start(roundId, questionIndex + 1); onScoreChange?.(); }
      finally { finishingRef.current = false; }
      return;
    }
    const { error: writeError } = await supabase.from("sessions").update({ pairs_status: "complete", phase: "intermission" }).eq("id", sessionId).eq("pairs_round_id", roundId).eq("current_question_index", questionIndex);
    if (writeError) { setError("Could not finish Match Made: " + writeError.message); finishingRef.current = false; return; }
    setOpen(false); onScoreChange?.(); onRoundComplete?.(); finishingRef.current = false;
  }
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if ((event.target as HTMLElement)?.closest("input,textarea,select,[contenteditable=true]")) return; if ((event.code === "Space" || event.key === " ") && !event.repeat) { event.preventDefault(); void finish(); } };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  });
  if (!open || typeof document === "undefined") return null;
  return createPortal(<PairsHostView pairs={pairs} rows={rows} scoreboard={scoreboard} fastestTeam={fastestTeam} status={status} questionIndex={questionIndex} questionCount={readPairsQuestions(rounds.find(r => r.id === roundId)?.questions).length} error={error} onNext={() => void finish()} />, document.body);
}

export function PairsHostView({ pairs, rows, scoreboard, fastestTeam, status, questionIndex, questionCount, error, onNext }: {
  pairs: PairRecord[];
  rows: { name: string; solved_pair_ids: string[]; mistakes: number }[];
  scoreboard: { team_name: string; total_points: number }[];
  fastestTeam: string | null;
  status: string;
  questionIndex: number;
  questionCount: number;
  error: string;
  onNext: () => void;
}) {
  return (<div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "#0a0118", color: "white", display: "flex", flexDirection: "column" }}>
    <button className="qi-mc-next" onClick={() => onNext()} style={{ flexShrink: 0 }}><small className="qi-mc-next__eyebrow">NEXT ACTION · Q{questionIndex + 1}</small><strong className="qi-mc-next__label">{status === "live" ? "Reveal Match Made results" : questionIndex + 1 < questionCount ? "Next Match Made question" : "Finish round and show scores"}</strong><span className="qi-mc-next__key" style={{ marginLeft: "auto" }}>Space ↵</span></button>
    {error && <div role="alert" style={{ padding: 10, textAlign: "center", color: "#ff7d87" }}>{error}</div>}
    <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: rows.length > 20 ? "minmax(0,1fr) minmax(0,2fr)" : "minmax(0,1.4fr) minmax(0,1fr)", gap: 16, padding: 16 }}>
      <main style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}><h2 style={{ fontSize: 22, color: "#d94fdc", margin: "0 0 8px" }}>MATCH MADE · {status === "complete" ? "RESULTS" : "LIVE"}</h2><p style={{ margin: "0 0 12px", color: "#cfc2e7" }}>Answer key · 1 point per pair · 3 points available</p><div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: rows.length > 20 ? "1fr" : "repeat(3,minmax(0,1fr))", gridTemplateRows: rows.length > 20 ? "repeat(3,minmax(0,1fr))" : "minmax(0,1fr)", gap: 12 }}>{pairs.map(pair => <div key={pair.pair_id} style={{ minHeight: 0, border: "1px solid #493060", borderRadius: 18, overflow: "hidden", display: "grid", gridTemplateColumns: rows.length > 20 ? "1fr 1fr" : "1fr", gridTemplateRows: rows.length > 20 ? "minmax(0,1fr)" : "1fr 1fr" }}>{[pair.a, pair.b].map(item => <div key={item.label} style={{ position: "relative", minHeight: 0 }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={getMediaUrl(item.image_url) || undefined} alt={item.label} style={{ width: "100%", height: "100%", objectFit: "contain" }} /><strong style={{ position: "absolute", inset: "auto 0 0", padding: "18px 8px 8px", background: "linear-gradient(transparent,rgba(0,0,0,.95))", textAlign: "center", fontSize: 16 }}>{item.label}</strong></div>)}</div>)}</div></main>
      <aside style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>Teams & scores</h2>
        <div style={{ color: "#cfc2e7", marginBottom: 10 }}>{rows.filter(r => r.solved_pair_ids.length === 3).length}/{rows.length} complete · Power cards disabled</div>
        {fastestTeam && <div style={{ color: "#2ee06e", fontWeight: 800, marginBottom: 8 }}>First complete: {fastestTeam}</div>}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: `repeat(${rows.length > 32 ? 4 : rows.length > 20 ? 3 : rows.length > 10 ? 2 : 1},minmax(0,1fr))`, gridAutoRows: "minmax(0,1fr)", gap: 6, minHeight: 0 }}>
          {rows.map(row => { const score = scoreboard.find(item => item.team_name.trim().toLowerCase() === row.name.trim().toLowerCase()); return <div key={row.name} style={{ minWidth: 0, minHeight: 0, border: "1px solid #493060", borderRadius: 9, padding: "4px 7px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}><strong title={row.name} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14 }}>{row.name}</strong><b style={{ color: "#d94fdc", fontSize: 18 }}>{score?.total_points ?? "—"}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 4, fontSize: 12 }}><span>{row.solved_pair_ids.length}/3 · {row.mistakes} misses</span><strong style={{ color: "#2ee06e" }}>+{row.solved_pair_ids.length} pts</strong></div>
          </div>; })}
        </div>
      </aside>
    </div>
  </div>);
}
