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

// Flat points per correct card - replaces the old escalating ladder
// (10/25/50/100). A steal always takes exactly this amount too, since it's
// what the busting team was gambling for on the card that broke them.
const CARD_POINTS = 10;

type Props = {
  sessionId: string;
  sessionPin: string;
  teams: { team_name: string }[];
  onScoreChange?: () => void;
  // Tells the host page when this overlay is up so its global spacebar
  // handler stands down (mirrors PursuitPanel's onActiveChange).
  onActiveChange?: (active: boolean) => void;
  // Runs the parent's normal end-of-round sequence when Hard Deck is closed -
  // mirrors PursuitPanel's onRoundComplete, so closing properly advances
  // hostPhase to "round_end" instead of silently pushing phase:"waiting".
  onRoundComplete?: () => void;
  // Set by the host's main round list when a Hard Deck round is reached in
  // the running order (via its round_start screen, exactly like every other
  // round type) - see PursuitPanel's identical autoStartRoundId for the
  // full reasoning. Each distinct value triggers one launch.
  autoStartRoundId?: string | null;
};

export function HardDeckPanel({ sessionId, sessionPin, teams, onScoreChange, onActiveChange, onRoundComplete, autoStartRoundId }: Props) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [open, setOpen] = useState(false);
  const [scoreWarnings, setScoreWarnings] = useState<string[]>([]);
  function reportScoreResult(name: string, result: { error?: string; scoreboardSyncError?: string }) {
    const message = result.error
      ? `${name}: score award was not confirmed. Check the saved score before continuing.`
      : result.scoreboardSyncError
        ? `${name}: points were saved, but Display/handset scores may be stale. Check the scoreboard before continuing.`
        : null;
    if (message) setScoreWarnings(previous => [...new Set([...previous, message])]);
  }
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

  // Tell the host page when this overlay is up so its global spacebar
  // handler stands down while Hard Deck is running (mirrors PursuitPanel).
  useEffect(() => { onActiveChange?.(open); }, [open, onActiveChange]);

  // Auto-launch: fires when the host reaches this Hard Deck round's
  // round_start screen and presses Space, exactly like Pursuit's identical
  // effect. lastAutoStartRef guards against relaunching on every render once
  // a value is set - only a genuinely new id triggers a launch.
  const lastAutoStartRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoStartRoundId) { lastAutoStartRef.current = null; return; }
    if (open) return;
    if (lastAutoStartRef.current === autoStartRoundId) return;
    lastAutoStartRef.current = autoStartRoundId;
    startHardDeck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartRoundId, open]);

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
      // The steal pool is exactly what the busting team was gambling FOR on
      // this card - a flat CARD_POINTS, same as every successful reveal
      // below - not `potential`, which is only what they'd already banked
      // from PREVIOUS successful reveals. On a first-guess bust `potential`
      // is still 0, which was paying stealing teams nothing even though the
      // busting team was genuinely gambling for CARD_POINTS on that guess.
      // That pool is shared evenly across every team that stole correctly
      // (per the host's explicit request), rather than each stealing team
      // getting the full CARD_POINTS regardless of how many others also
      // guessed right - the busting team only lost one card's worth, so the
      // total paid out to stealers should never exceed that.
      const stolenPoints = winners.length > 0 ? Math.floor(CARD_POINTS / winners.length) : 0;
      setPotential(0);
      await Promise.all(winners.map(async name => {
        try {
          const result = await applyScoreDelta(supabase, sessionPin, name, stolenPoints, {
            eventKey: `harddeck-steal:${sessionId}:${playId}:${cards.length}:${name}`,
          });
          reportScoreResult(name, result);
        } catch {
          reportScoreResult(name, { error: "Score request failed" });
        }
      }));
      setStatus("lost");
      setStealWinners(winners);
      setStealPoints(stolenPoints);
      await pushState({ hard_deck_cards: newCards, hard_deck_status: "lost", hard_deck_potential: 0, hard_deck_guess: null, hard_deck_steal_winners: winners });
      onScoreChange?.();
      revealInFlightRef.current = false;
      return;
    }

    const cardNumber = newCards.length;
    // Flat 10 points per correct card, cumulative - replaces the old ladder
    // (10/25/50/100 to fixed tiers) per the host's explicit request.
    const newPotential = potential + CARD_POINTS;
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
    try {
      const result = await applyScoreDelta(supabase, sessionPin, team, amount, {
        roundDelta: 0,
        eventKey: `harddeck:${sessionId}:${playId}:${team}:${cards.length}`,
      });
      reportScoreResult(team, result);
    } catch {
      reportScoreResult(team, { error: "Score request failed" });
    }
    onScoreChange?.();
  }

  useEffect(() => {
    if (status === "won" && team && potential > 0) {
      applyBankedPoints(potential);
    }
  }, [status]);

  function closePanel() {
    setOpen(false);
    // Leave the Hard Deck-specific state, but let the parent's own
    // end-of-round sequence (onRoundComplete) own the actual phase/
    // session_rounds bookkeeping - mirrors PursuitPanel's closePanel.
    // Previously this pushed phase:"waiting" directly, which never told the
    // parent's hostPhase to leave round_start, so Space did nothing
    // afterwards.
    pushState({ hard_deck_status: "idle" });
    onRoundComplete?.();
  }

  // Previously a tiny 11px pill buried in the header nav next to "Open
  // Display" - easy to lose entirely among the other controls there. Now
  // portaled to a fixed, centered, large call-to-action so the host can spot
  // it at a glance regardless of what else is on screen, matching how the
  // main overlay itself is already portaled straight to <body>.
  // No floating launch button anymore - Hard Deck now starts only from its
  // own round_start screen in the running order (see autoStartRoundId
  // above), exactly like Pursuit has zero manual launch button of its own.
  const warningPanel = scoreWarnings.length > 0 ? (
    <div role="alert" style={{ position: "fixed", bottom: 16, left: 16, right: 16, zIndex: 10000, padding: 16, background: "#3b1018", color: "white", border: "2px solid #ff8290", borderRadius: 12 }}>
      <strong>Hard Deck scoring needs attention</strong>
      {scoreWarnings.map(message => <div key={message}>{message}</div>)}
      <button onClick={() => setScoreWarnings([])}>Dismiss warning</button>
    </div>
  ) : null;
  if (!open) return typeof document !== "undefined" && warningPanel ? createPortal(warningPanel, document.body) : null;

  const showRevealBaseButton = !showWheel && team && cards.length === 0;

  // Rendered through a portal to <body> rather than inline. This component is
  // mounted inside the host header, which uses `backdrop-filter: blur()`; that
  // property makes the header a containing block for `position: fixed`
  // descendants, so this overlay was being positioned/clipped relative to the
  // thin header bar instead of the viewport (title pushed off the top of the
  // page, controls unreachable). Portaling to <body> escapes that context so
  // the fixed overlay fills the real viewport and is fully usable.
  const overlay = (
    <div
      className="qi-host-harddeck"
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0, maxHeight: "100dvh", boxSizing: "border-box" as const,
        background: "radial-gradient(ellipse 60% 45% at 50% 48%, rgb(190 38 193 / 0.12), transparent 72%), linear-gradient(180deg, var(--qi-bg-stage-soft), var(--qi-bg-stage))",
        zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflow: "hidden",
      }}
    >
      <div
        className="qi-panel qi-panel--elevated qi-host-harddeck-panel"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, width: "min(94vw, 780px)", maxHeight: "min(92dvh, 900px)", overflow: "auto" }}
      >
      <div style={{ fontFamily: "'Bruno Ace SC', sans-serif", fontSize: (!showWheel && team) ? 16 : 28, color: (!showWheel && team) ? "rgba(190,38,193,0.5)" : "#BE26C1", letterSpacing: (!showWheel && team) ? 3 : 4, fontWeight: (!showWheel && team) ? 600 : 400 }}>THE HARD DECK</div>

      {showWheel && (
        <SpinWheel segments={buildTeamSegments(teams.map(t => t.team_name))} onResult={onWheelResult} size={300} forceResultIndex={wheelTarget ?? undefined} onSpinStart={() => pushState({ hard_deck_wheel_spinning: true })} />
      )}

      {!showWheel && team && (
        <>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", letterSpacing: 0.5 }}>Team: <strong style={{ fontWeight: 800 }}>{team}</strong></div>

          {/* This row shows every card revealed so far this hand (not just
              the latest one - see task history), so its width keeps
              growing through a long hand. The panel around it is
              overflow:hidden (needed to keep the whole overlay pinned to
              the viewport), so without its own wrap/scroll handling, cards
              past a certain count would simply run off the edge with no
              way to see them. maxWidth+overflowX is a safety net; flexWrap
              is the primary fix so it reads as a normal multi-row hand
              instead of needing to scroll at all in the common case. */}
          <div className="qi-host-harddeck-cards" style={{ padding: "20px 24px", borderRadius: 20, background: "linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))", border: "1px solid rgba(190,38,193,0.25)", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05), inset 0 -1px 20px rgba(0,0,0,0.4), 0 0 30px rgba(190,38,193,0.15)", maxWidth: "92vw", maxHeight: "min(50vh, 400px)", overflow: "auto" }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", maxWidth: "min(88vw, 900px)" }}>
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

      <button onClick={closePanel} style={{ marginTop: 4, padding: "6px 14px", borderRadius: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer" }}>Close</button>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(<>{overlay}{warningPanel}</>, document.body) : null;
}
