"use client";
import { useEffect, useState, useCallback } from "react";
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

const POINTS_LADDER = [5, 10, 20, 40];

type Props = {
  sessionId: string;
  sessionPin: string;
  teams: { team_name: string }[];
  onScoreChange?: () => void;
};

export function HardDeckPanel({ sessionId, sessionPin, teams, onScoreChange }: Props) {
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

  function startHardDeck() {
    const targetIdx = Math.floor(Math.random() * teams.length);
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
    pushState({ hard_deck_status: "wheel", hard_deck_team: null, hard_deck_cards: [], hard_deck_guess: null, hard_deck_potential: 0, hard_deck_has_swapped: false, hard_deck_wheel_target: targetIdx, hard_deck_wheel_spinning: false, phase: "hard_deck" });
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
    pushState({ hard_deck_status: "awaiting_guess" });
  }

  function swapBase() {
    const newDeck = [...deck];
    const card = newDeck.pop()!;
    setDeck(newDeck);
    setCards([card]);
    setHasSwapped(true);
    setStatus("awaiting_guess");
    pushState({ hard_deck_cards: [card], hard_deck_has_swapped: true, hard_deck_status: "awaiting_guess" });
  }

  function revealNextCard() {
    if (!guess) return;
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
      setStatus("lost");
      setPotential(0);
      pushState({ hard_deck_cards: newCards, hard_deck_status: "lost", hard_deck_potential: 0, hard_deck_guess: null });
      return;
    }

    const cardNumber = newCards.length;
    const ladderIdx = cardNumber - 2;
    const newPotential = POINTS_LADDER[ladderIdx] ?? POINTS_LADDER[POINTS_LADDER.length - 1];
    setPotential(newPotential);
    setGuess(null);

    if (cardNumber >= 5) {
      setStatus("won");
      pushState({ hard_deck_cards: newCards, hard_deck_status: "won", hard_deck_potential: newPotential, hard_deck_guess: null });
    } else {
      setStatus("decision");
      pushState({ hard_deck_cards: newCards, hard_deck_status: "decision", hard_deck_potential: newPotential, hard_deck_guess: null });
    }
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
      eventKey: `harddeck:${sessionId}:${team}:${cards.length}`,
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

  if (!open) {
    return (
      <button onClick={startHardDeck} style={{ padding: "6px 14px", borderRadius: 10, background: "rgba(190,38,193,0.3)", border: "1px solid #BE26C1", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}>
        Start The Hard Deck
      </button>
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
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, maxHeight: "100vh", boxSizing: "border-box" as const, background: "rgba(5,2,10,0.97)", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: 24, padding: 24, overflowY: "auto" }}>
      <div style={{ fontFamily: "'Bruno Ace SC', sans-serif", fontSize: (!showWheel && team) ? 16 : 28, color: (!showWheel && team) ? "rgba(190,38,193,0.5)" : "#BE26C1", letterSpacing: (!showWheel && team) ? 3 : 4, fontWeight: (!showWheel && team) ? 600 : 400 }}>THE HARD DECK</div>

      {showWheel && (
        <SpinWheel segments={buildTeamSegments(teams.map(t => t.team_name))} onResult={onWheelResult} size={300} forceResultIndex={wheelTarget ?? undefined} onSpinStart={() => pushState({ hard_deck_wheel_spinning: true })} />
      )}

      {!showWheel && team && (
        <>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", letterSpacing: 0.5 }}>Team: <strong style={{ fontWeight: 800 }}>{team}</strong></div>

          <div style={{ padding: "20px 24px", borderRadius: 20, background: "linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))", border: "1px solid rgba(190,38,193,0.25)", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05), inset 0 -1px 20px rgba(0,0,0,0.4), 0 0 30px rgba(190,38,193,0.15)" }}>
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
            </>
          )}

          {status === "decision" && (
            <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.65)" }}>Waiting for team to choose Stick or Gamble on their phone...</div>
          )}

          {status === "won" && (
            <div style={{ fontSize: 26, fontWeight: 800, color: "#22c55e", letterSpacing: 0.5 }}>WON {potential} points! 🎉</div>
          )}

          {status === "lost" && (
            <div style={{ fontSize: 26, fontWeight: 800, color: "#ef4444", letterSpacing: 0.5 }}>Bust — 0 points</div>
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
