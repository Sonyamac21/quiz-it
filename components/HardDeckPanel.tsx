"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { SpinWheel, buildTeamSegments } from "@/components/SpinWheel";
import { applyScoreDelta } from "@/lib/quiz/scoreService";

type PlayingCard = { rank: number; suit: "♠" | "♥" | "♦" | "♣" };
type HardDeckStatus =
  | "idle"
  | "wheel"
  | "base_revealed"
  | "awaiting_guess"
  | "revealing"
  | "decision"
  | "won"
  | "lost";

const RANK_LABELS: Record<number, string> = { 1: "A", 11: "J", 12: "Q", 13: "K" };
function rankLabel(rank: number): string {
  return RANK_LABELS[rank] || String(rank);
}

const POINTS_LADDER = [10, 25, 50, 100];

type Props = {
  sessionId: string;
  sessionPin: string;
  teams: { team_name: string }[];
  onScoreChange?: () => void;
  // The launch button only makes sense while the host is actually on a Hard
  // Deck round - it used to be always-visible for the entire quiz (a
  // Regular round, Hot Seat, anything), permanently occupying the header/
  // now-centered call-to-action even when there was nothing to start.
  showLaunchButton?: boolean;
};

export function HardDeckPanel({ sessionId, sessionPin, teams, onScoreChange, showLaunchButton = true }: Props) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState<string | null>(null);
  const [cards, setCards] = useState<PlayingCard[]>([]);
  const [status, setStatus] = useState<HardDeckStatus>("idle");
  const [guess, setGuess] = useState<string | null>(null);
  const [potential, setPotential] = useState(0);
  const [hasSwapped, setHasSwapped] = useState(false);
  const [showWheel, setShowWheel] = useState(false);
  const [deck, setDeck] = useState<PlayingCard[]>([]);
  const [wheelTarget, setWheelTarget] = useState<number | null>(null);
  const [stealGuesses, setStealGuesses] = useState<Record<string, string>>({});
  const [stealWinners, setStealWinners] = useState<string[]>([]);
  // Held separately from `potential` (which is zeroed on a bust) purely so
  // the "lost" screen can still show what the steal was actually worth.
  const [stealPoints, setStealPoints] = useState(0);
  const [playId, setPlayId] = useState("");
  const revealInFlightRef = useRef(false);

  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel("hard-deck-host-" + sessionPin)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: "id=eq." + sessionId },
        (payload) => {
          const row = payload.new as any;
          if (row.hard_deck_guess !== undefined) setGuess(row.hard_deck_guess);
          if (row.hard_deck_status !== undefined) setStatus(row.hard_deck_status);
          if (row.hard_deck_potential !== undefined) setPotential(row.hard_deck_potential);
          if (row.hard_deck_steal_guesses !== undefined) setStealGuesses(row.hard_deck_steal_guesses || {});
          if (row.hard_deck_steal_winners !== undefined) setStealWinners(row.hard_deck_steal_winners || []);
          if (row.hard_deck_play_id !== undefined) setPlayId(row.hard_deck_play_id || "");
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, sessionPin, supabase]);

  const pushState = useCallback(async (fields: Record<string, unknown>) => {
    await supabase.from("sessions").update(fields).eq("id", sessionId);
  }, [sessionId, supabase]);

  function buildDeck(): PlayingCard[] {
    const suits: PlayingCard["suit"][] = ["♠", "♥", "♦", "♣"];
    const newDeck: PlayingCard[] = [];
    for (const suit of suits) for (let rank = 1; rank <= 13; rank++) newDeck.push({ rank, suit });
    for (let i = newDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    return newDeck;
  }

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("sessions").select("phase,hard_deck_team,hard_deck_cards,hard_deck_guess,hard_deck_potential,hard_deck_status,hard_deck_has_swapped,hard_deck_wheel_target,hard_deck_steal_guesses,hard_deck_steal_winners,hard_deck_play_id").eq("id", sessionId).maybeSingle();
      if (cancelled || !data || data.phase !== "hard_deck") return;
      const restoredStatus = data.hard_deck_status as HardDeckStatus;
      if (!restoredStatus || ["idle", "won", "lost"].includes(restoredStatus)) return;
      const restoredCards = (data.hard_deck_cards as PlayingCard[] | null) ?? [];
      const restoredDeck = buildDeck().filter(card => !restoredCards.some(shown => shown.rank === card.rank && shown.suit === card.suit));
      setTeam(data.hard_deck_team || null);
      setCards(restoredCards);
      setGuess(data.hard_deck_guess || null);
      setPotential(data.hard_deck_potential || 0);
      setHasSwapped(!!data.hard_deck_has_swapped);
      setWheelTarget(data.hard_deck_wheel_target ?? null);
      setStealGuesses((data.hard_deck_steal_guesses as Record<string, string>) || {});
      setStealWinners((data.hard_deck_steal_winners as string[]) || []);
      setPlayId((data.hard_deck_play_id as string) || "");
      setDeck(restoredDeck);
      setShowWheel(restoredStatus === "wheel");
      setStatus(restoredStatus);
      setOpen(true);
    })();
    return () => { cancelled = true; };
  }, [sessionId, supabase]);

  function startHardDeck() {
    const targetIdx = Math.floor(Math.random() * teams.length);
    const nextPlayId = crypto.randomUUID();
    setOpen(true);
    setShowWheel(true);
    setTeam(null);
    setCards([]);
    setStatus("wheel");
    setPotential(0);
    setHasSwapped(false);
    setGuess(null);
    setDeck(buildDeck());
    setWheelTarget(targetIdx);
    setStealGuesses({});
    setStealWinners([]);
    setStealPoints(0);
    setPlayId(nextPlayId);
    pushState({ hard_deck_status: "wheel", hard_deck_team: null, hard_deck_cards: [], hard_deck_guess: null, hard_deck_potential: 0, hard_deck_has_swapped: false, hard_deck_wheel_target: targetIdx, hard_deck_wheel_spinning: false, hard_deck_steal_guesses: {}, hard_deck_steal_winners: [], hard_deck_play_id: nextPlayId, phase: "hard_deck" });
  }

  function onWheelResult(seg: { label: string }) {
    setTeam(seg.label);
    setShowWheel(false);
    pushState({ hard_deck_team: seg.label });
  }

  function revealBaseCard() {
    const newDeck = [...deck];
    const card = newDeck.pop()!;
    setDeck(newDeck);
    setCards([card]);
    setStatus("base_revealed");
    pushState({ hard_deck_cards: [card], hard_deck_status: "base_revealed" });
  }

  function keepBase() {
    setStatus("awaiting_guess");
    setStealGuesses({});
    pushState({ hard_deck_status: "awaiting_guess", hard_deck_steal_guesses: {}, hard_deck_steal_winners: [] });
  }

  function swapBase() {
    const newDeck = [...deck];
    const card = newDeck.pop()!;
    setDeck(newDeck);
    setCards([card]);
    setHasSwapped(true);
    setStatus("awaiting_guess");
    setStealGuesses({});
    pushState({ hard_deck_cards: [card], hard_deck_has_swapped: true, hard_deck_status: "awaiting_guess", hard_deck_steal_guesses: {}, hard_deck_steal_winners: [] });
  }

  async function revealNextCard() {
    if (!guess || revealInFlightRef.current) return;
    revealInFlightRef.current = true;
    setStatus("revealing");
    await pushState({ hard_deck_status: "revealing" });
    const { data: lockedRound } = await supabase.from("sessions")
      .select("hard_deck_steal_guesses").eq("id", sessionId).maybeSingle();
    const lockedSteals = (lockedRound?.hard_deck_steal_guesses as Record<string, string>) || stealGuesses;
    const newDeck = [...deck];
    const nextCard = newDeck.pop()!;
    setDeck(newDeck);
    const prevCard = cards[cards.length - 1];
    const prevVal = prevCard.rank === 1 ? 14 : prevCard.rank;
    const nextVal = nextCard.rank === 1 ? 14 : nextCard.rank;
    const newCards = [...cards, nextCard];
    setCards(newCards);

    const tie = prevVal === nextVal;
    const correct = !tie && (guess === "higher" ? nextVal > prevVal : nextVal < prevVal);

    if (tie || !correct) {
      const actualDirection = tie ? null : (nextVal > prevVal ? "higher" : "lower");
      const winners = actualDirection
        ? Object.entries(lockedSteals).filter(([name, answer]) => name !== team && answer === actualDirection).map(([name]) => name)
        : [];
      // Steal winners take exactly what the busting team was playing for -
      // the pot at risk at the moment of the bust - not a flat consolation
      // amount, so a steal on a big pot is actually worth stealing.
      const stolenPoints = potential;
      setPotential(0);
      await Promise.all(winners.map(name => applyScoreDelta(supabase, sessionPin, name, stolenPoints, {
        eventKey: `harddeck-steal:${sessionId}:${playId}:${cards.length}:${name}`,
      })));
      setStatus("lost");
      setStealWinners(winners);
      setStealPoints(stolenPoints);
      await pushState({ hard_deck_cards: newCards, hard_deck_status: "lost", hard_deck_potential: 0, hard_deck_guess: null, hard_deck_steal_winners: winners });
      onScoreChange?.();
      revealInFlightRef.current = false;
      return;
    }

    const cardNumber = newCards.length;
    const ladderIdx = cardNumber - 2;
    const newPotential = POINTS_LADDER[ladderIdx] ?? POINTS_LADDER[POINTS_LADDER.length - 1];
    setPotential(newPotential);
    setGuess(null);
    setStealGuesses({});

    if (cardNumber >= 5) {
      setStatus("won");
      pushState({ hard_deck_cards: newCards, hard_deck_status: "won", hard_deck_potential: newPotential, hard_deck_guess: null, hard_deck_steal_guesses: {} });
    } else {
      setStatus("decision");
      pushState({ hard_deck_cards: newCards, hard_deck_status: "decision", hard_deck_potential: newPotential, hard_deck_guess: null, hard_deck_steal_guesses: {} });
    }
    revealInFlightRef.current = false;
  }

  async function applyBankedPoints(amount: number) {
    if (!team || amount <= 0) return;
    // Routed through the shared score service (scores table is authoritative).
    // roundDelta: 0 preserves the pre-existing behaviour of this function,
    // which only ever adjusted total_points for a team (a scores row already
    // exists for every team by the time Hard Deck can run, created at team
    // join / "Initialise Scores") and left round_points untouched.
    const result = await applyScoreDelta(supabase, sessionPin, team, amount, {
      roundDelta: 0,
      eventKey: `harddeck:${sessionId}:${playId}:${team}:${cards.length}`,
    });
    if (result.scoreboardSyncError) console.error("Hard Deck: score updated but scoreboard_data sync failed:", result.scoreboardSyncError);
    onScoreChange?.();
  }

  useEffect(() => {
    if (status === "won" && team && potential > 0) {
      applyBankedPoints(potential);
    }
  }, [status]);

  function closePanel() {
    setOpen(false);
    pushState({ hard_deck_status: "idle", phase: "waiting" });
  }

  // Previously a tiny 11px pill buried in the header nav next to "Open
  // Display" - easy to lose entirely among the other controls there. Now
  // portaled to a fixed, centered, large call-to-action so the host can spot
  // it at a glance regardless of what else is on screen, matching how the
  // main overlay itself is already portaled straight to <body>.
  if (!open) {
    if (!showLaunchButton) return null;
    return createPortal(
      <div style={{ position: "fixed", top: 84, left: "50%", transform: "translateX(-50%)", zIndex: 190, pointerEvents: "none" }}>
        <button onClick={startHardDeck} style={{ pointerEvents: "auto", padding: "14px 32px", borderRadius: 999, background: "linear-gradient(145deg,#BE26C1,#8A1B8D)", border: "1px solid #D94FDC", color: "#fff", fontSize: 16, fontWeight: 800, letterSpacing: 1, cursor: "pointer", boxShadow: "0 6px 24px rgba(190,38,193,0.5), 0 0 30px rgba(217,79,220,0.35)" }}>
          🃏 Start The Hard Deck
        </button>
      </div>,
      document.body
    );
  }

  const showRevealBaseButton = !showWheel && team && cards.length === 0;

  // Rendered through a portal to <body> rather than inline. This component is
  // mounted inside the host header, which uses `backdrop-filter: blur()`; that
  // property makes the header a containing block for `position: fixed`
  // descendants, so this overlay was being positioned/clipped relative to the
  // thin header bar instead of the viewport (title pushed off the top of the
  // page, controls unreachable). Portaling to <body> escapes that context so
  // the fixed overlay fills the real viewport and is fully usable.
  const overlay = (
    <div className="qi-host-harddeck" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, maxHeight: "100dvh", boxSizing: "border-box" as const, background: "rgba(5,2,10,0.97)", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: 24, padding: 24, overflow: "hidden" }}>
      <div style={{ fontFamily: "'Bruno Ace SC', sans-serif", fontSize: (!showWheel && team) ? 16 : 28, color: (!showWheel && team) ? "rgba(190,38,193,0.5)" : "#BE26C1", letterSpacing: (!showWheel && team) ? 3 : 4, fontWeight: (!showWheel && team) ? 600 : 400 }}>THE HARD DECK</div>

      {showWheel && (
        <SpinWheel segments={buildTeamSegments(teams.map(t => t.team_name))} onResult={onWheelResult} size={300} forceResultIndex={wheelTarget ?? undefined} onSpinStart={() => pushState({ hard_deck_wheel_spinning: true })} />
      )}

      {!showWheel && team && (
        <>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", letterSpacing: 0.5 }}>Team: <strong style={{ fontWeight: 800 }}>{team}</strong></div>

          <div className="qi-host-harddeck-cards" style={{ padding: "20px 24px", borderRadius: 20, background: "linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))", border: "1px solid rgba(190,38,193,0.25)", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05), inset 0 -1px 20px rgba(0,0,0,0.4), 0 0 30px rgba(190,38,193,0.15)" }}>
            <div style={{ display: "flex", gap: 12 }}>
              {cards.map((c, i) => (
                <div key={i} style={{ width: "clamp(82px,8vw,120px)", height: "clamp(118px,11.5vw,172px)", borderRadius: 14, background: "linear-gradient(160deg, #ffffff 0%, #f2f2f5 100%)", border: "1px solid rgba(0,0,0,0.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -6px 10px rgba(0,0,0,0.05), 0 6px 16px rgba(0,0,0,0.45), 0 0 0 1px rgba(212,175,90,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", fontSize: "clamp(28px,3vw,44px)", fontWeight: 700, color: (c.suit === "♥" || c.suit === "♦") ? "#dc2626" : "#111" }}>
                  <div>{rankLabel(c.rank)}</div>
                  <div style={{ fontSize: 28 }}>{c.suit}</div>
                </div>
              ))}
            </div>
          </div>

          {potential > 0 && (status === "decision" || status === "won") && (
            <div style={{ fontSize: 20, fontWeight: 700, color: "#facc15", letterSpacing: 0.5 }}>Potential: {potential} pts</div>
          )}

          {showRevealBaseButton && (
            <button onClick={revealBaseCard} style={{ padding: "11px 26px", borderRadius: 12, background: "rgba(190,38,193,0.3)", border: "1px solid #BE26C1", color: "#fff", fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.3)" }}>Reveal Base Card</button>
          )}

          {status === "base_revealed" && (
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={keepBase} style={{ padding: "11px 26px", borderRadius: 12, background: "rgba(34,197,94,0.25)", border: "1px solid #22c55e", color: "#fff", fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.3)" }}>Keep</button>
              <button onClick={swapBase} disabled={hasSwapped} style={{ padding: "11px 26px", borderRadius: 12, background: "rgba(239,68,68,0.25)", border: "1px solid #ef4444", color: "#fff", fontWeight: 700, cursor: hasSwapped ? "not-allowed" : "pointer", opacity: hasSwapped ? 0.4 : 1, boxShadow: hasSwapped ? "none" : "0 2px 10px rgba(0,0,0,0.3)" }}>Swap</button>
            </div>
          )}

          {status === "awaiting_guess" && (
            <>
              {!guess ? (
                <div style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.65)", letterSpacing: 1 }}>
                  Waiting for {team}&rsquo;s guess on their phone&hellip;
                </div>
              ) : (
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                  padding: "20px 48px", borderRadius: 16,
                  background: guess === "higher" ? "rgba(34,197,94,0.22)" : "rgba(239,68,68,0.22)",
                  border: "3px solid " + (guess === "higher" ? "#22c55e" : "#ef4444"),
                  boxShadow: "0 0 32px " + (guess === "higher" ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)"),
                  animation: "qiGuessPulse var(--qi-motion-moment) var(--qi-ease-settle)"
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2, color: "rgba(255,255,255,0.6)" }}>GUESS LOCKED IN</div>
                  <div style={{
                    fontSize: 44, fontWeight: 800, letterSpacing: 2, lineHeight: 1,
                    color: guess === "higher" ? "#22c55e" : "#ef4444",
                    display: "flex", alignItems: "center", gap: 14
                  }}>
                    <span style={{ fontSize: 48 }}>{guess === "higher" ? "▲" : "▼"}</span>
                    {guess.toUpperCase()}
                  </div>
                </div>
              )}
              <button onClick={revealNextCard} disabled={!guess} style={{ padding: "14px 32px", borderRadius: 12, fontSize: 16, fontWeight: 700, background: guess ? "rgba(190,38,193,0.3)" : "rgba(255,255,255,0.08)", border: "1px solid " + (guess ? "#BE26C1" : "rgba(255,255,255,0.2)"), color: "#fff", cursor: guess ? "pointer" : "not-allowed", boxShadow: guess ? "0 2px 10px rgba(0,0,0,0.3)" : "none" }}>Reveal Next Card</button>
              <div style={{ color: "#B9A8D9", fontSize: 14 }}>{Object.keys(stealGuesses).length} of {Math.max(0, teams.length - 1)} other teams locked in for a steal</div>
            </>
          )}

          {status === "decision" && (
            <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.65)" }}>Waiting for team to choose Stick or Gamble on their phone...</div>
          )}

          {status === "won" && (
            <div style={{ fontSize: 26, fontWeight: 800, color: "#22c55e", letterSpacing: 0.5 }}>WON {potential} points! 🎉</div>
          )}

          {status === "lost" && (
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 26, fontWeight: 800, color: "#ef4444", letterSpacing: 0.5 }}>Bust — 0 points</div>{stealWinners.length > 0 && <div style={{ marginTop: 8, color: "#22c55e", fontWeight: 800 }}>+{stealPoints} steal: {stealWinners.join(", ")}</div>}</div>
          )}

          {(status === "won" || status === "lost") && (
            <button onClick={startHardDeck} style={{ padding: "9px 20px", borderRadius: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}>Spin Again</button>
          )}
        </>
      )}

      <button onClick={closePanel} style={{ marginTop: 16, padding: "6px 14px", borderRadius: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer" }}>Close</button>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(overlay, document.body) : null;
}
