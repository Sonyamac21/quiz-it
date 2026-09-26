"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { SpinWheel, buildTeamSegments } from "@/components/SpinWheel";
import { applyScoreDelta } from "@/lib/quiz/scoreService";
import { HARD_DECK_CARD_POINTS, hardDeckGambleStake, hardDeckStealAward } from "@/lib/quiz/hardDeck";
import { MissionControlTopBar } from "@/components/ui/quiz-it-ui";
import { FitScaleBlock } from "@/components/FitScaleBlock";

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

// Kept as a compatibility export for existing callers. Scoring and UI use
// the shared Hard Deck helpers so the gamble and steal can never drift.
export const CARD_POINTS = HARD_DECK_CARD_POINTS;

type Props = {
  sessionId: string;
  sessionPin: string;
  teams: { team_name: string }[];
  // Host request: Hard Deck's full-screen overlay had NO team rail at all
  // (its .qi-mc-workspace was a single grid-template-columns: minmax(0,1fr)
  // column, unlike every other round's two-column layout) - the scoreboard
  // genuinely disappeared for the entire time Hard Deck was running, not
  // just visually cramped. Passed in so the rail added below can show every
  // team's live total without this component needing its own separate
  // score-fetching logic.
  scores?: { team_name: string; total_points: number }[];
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
  // Threaded down from the main console so MissionControlTopBar can render
  // the same Session PIN/TV/Open Display/End quiz row this overlay was
  // otherwise missing entirely - see that component's own comment.
  tvStatus?: { level: string; summary: string } | null;
  onOpenDiagnostics?: () => void;
  endQuizLabel?: string;
  onEndQuiz?: () => void;
};

export function HardDeckPanel({ sessionId, sessionPin, teams, scores = [], onScoreChange, onActiveChange, onRoundComplete, autoStartRoundId, tvStatus, onOpenDiagnostics, endQuizLabel, onEndQuiz }: Props) {
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
  // Host: "I have a scroll on this screen. I don't want it. Fit in the area
  // we have." The wheel's size used window.innerHeight*0.72 - the WHOLE
  // window, not the actual room left in .qi-mc-desk once the top bar,
  // Next-Action bar and "THE HARD DECK" header row are subtracted, so on a
  // laptop screen the wheel could genuinely be taller than the space it had
  // and force this panel to scroll. Measuring the real container instead
  // makes the wheel always fit exactly, the same way every other round's
  // FitScaleBlock-driven content does.
  const wheelBoxRef = useRef<HTMLDivElement>(null);
  const [wheelBoxSize, setWheelBoxSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = wheelBoxRef.current;
    if (!el) return;
    const measure = () => setWheelBoxSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [showWheel]);
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
          if (row.hard_deck_steal_points !== undefined) setStealPoints(row.hard_deck_steal_points || 0);
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
    pushState({ hard_deck_status: "wheel", hard_deck_team: null, hard_deck_cards: [], hard_deck_guess: null, hard_deck_potential: 0, hard_deck_has_swapped: false, hard_deck_wheel_target: targetIdx, hard_deck_wheel_spinning: false, hard_deck_steal_guesses: {}, hard_deck_steal_winners: [], hard_deck_steal_points: 0, hard_deck_play_id: nextPlayId, phase: "hard_deck" });
  }

  // Previously this only picked the team and left the base card face-down
  // behind an extra "Reveal Base Card" Next-Action screen, costing the host
  // a second spacebar press for no real pacing benefit (host asked for this
  // to be one press, not two). The base card now flips as part of the same
  // wheel-result step, going straight to the Keep/Swap choice.
  function onWheelResult(seg: { label: string }) {
    const newDeck = [...deck];
    const card = newDeck.pop()!;
    setTeam(seg.label);
    setShowWheel(false);
    setDeck(newDeck);
    setCards([card]);
    setStatus("base_revealed");
    pushState({ hard_deck_team: seg.label, hard_deck_cards: [card], hard_deck_status: "base_revealed" });
  }

  function keepBase() {
    setStatus("awaiting_guess");
    setStealGuesses({});
    pushState({ hard_deck_status: "awaiting_guess", hard_deck_steal_guesses: {}, hard_deck_steal_winners: [], hard_deck_steal_points: 0 });
  }

  function swapBase() {
    const newDeck = [...deck];
    const card = newDeck.pop()!;
    setDeck(newDeck);
    setCards([card]);
    setHasSwapped(true);
    setStatus("awaiting_guess");
    setStealGuesses({});
    pushState({ hard_deck_cards: [card], hard_deck_has_swapped: true, hard_deck_status: "awaiting_guess", hard_deck_steal_guesses: {}, hard_deck_steal_winners: [], hard_deck_steal_points: 0 });
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
      // The steal pool follows the playing team's live gamble: 10 on the
      // opening card, then the full accumulated potential they chose to risk.
      // Correct predictors share that one pool evenly.
      const stolenPoints = hardDeckStealAward(potential, winners.length);
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
      await pushState({ hard_deck_cards: newCards, hard_deck_status: "lost", hard_deck_potential: 0, hard_deck_guess: null, hard_deck_steal_winners: winners, hard_deck_steal_points: stolenPoints });
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

  // Host: "add the manual recovery bar and buttons." Hard Deck had no
  // recovery tool at all - unlike Pursuit's "Recover Graphics" (which
  // re-pushes its last known state so a display/handset that missed a
  // realtime update catches back up), there was nothing here to reach for
  // if a team's phone or the venue display ever looked out of sync. This
  // re-sends the exact state already held locally - never a new value, so
  // it cannot corrupt an in-progress hand - the same safe "nudge everyone
  // back in sync" action Pursuit's button performs.
  const [resyncing, setResyncing] = useState(false);
  async function resyncState() {
    setResyncing(true);
    try {
      await pushState({
        hard_deck_status: status, hard_deck_team: team, hard_deck_cards: cards,
        hard_deck_guess: guess, hard_deck_potential: potential, hard_deck_has_swapped: hasSwapped,
        hard_deck_wheel_target: wheelTarget, hard_deck_steal_guesses: stealGuesses,
        hard_deck_steal_winners: stealWinners, hard_deck_steal_points: stealPoints, hard_deck_play_id: playId,
      });
    } finally {
      setResyncing(false);
    }
  }

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

  // Single "next action" the host takes to advance the hand - surfaced in
  // the same fixed Next-Action bar every other round type (and Pursuit's own
  // host console) uses, instead of a button buried in the middle of a
  // centered column. Two-choice moments (Keep/Swap, the player's own
  // Stick/Gamble) stay as in-desk buttons since there's no single "next"
  // step to name; everything else that's genuinely one action gets promoted
  // here so the host's eye goes to the same place it always does. The base
  // card itself is no longer a separate Next-Action step - see onWheelResult.
  const nextLabel = status === "awaiting_guess" ? "Reveal Next Card"
    : (status === "won" || status === "lost") ? "Spin Again"
    : null;
  const nextHandler = status === "awaiting_guess" ? revealNextCard
    : (status === "won" || status === "lost") ? startHardDeck
    : undefined;
  const nextDisabled = status === "awaiting_guess" && !guess;

  // The Next-Action bar's "Space ↵" hint mirrors Pursuit's, so pressing
  // Space needs to actually trigger it here too - Pursuit has its own
  // keydown listener for exactly this reason (the main host page's global
  // spacebar handler stands down via onActiveChange while this overlay is
  // open, so nothing else is listening for Space at all while Hard Deck is
  // running). Without this, the bar showed a live next-action and a Space
  // hint that silently did nothing, which read as "the base card never
  // revealed" rather than "the button just needs a click instead".
  useEffect(() => {
    if (!open || !nextHandler || nextDisabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      if (e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      nextHandler!();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, nextHandler, nextDisabled]);

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

  // Rendered through a portal to <body> rather than inline. This component is
  // mounted inside the host header, which uses `backdrop-filter: blur()`; that
  // property makes the header a containing block for `position: fixed`
  // descendants, so this overlay was being positioned/clipped relative to the
  // thin header bar instead of the viewport (title pushed off the top of the
  // page, controls unreachable). Portaling to <body> escapes that context so
  // the fixed overlay fills the real viewport and is fully usable.
  //
  // Structure below deliberately mirrors PursuitPanel's host console (fixed
  // Next-Action bar, then a header row, then a .qi-mc-workspace/.qi-mc-desk
  // body) rather than the old bespoke centered-column layout. The old layout
  // was its own one-off design - different chrome, different spacing rules,
  // no Next-Action bar - so it read as a different app bolted on rather than
  // another screen of the same host console, even after matching its colors.
  // Reusing the actual layout classes every other round (and Pursuit) uses
  // is what actually fixes that, not another palette pass.
  const overlay = (
    <div className="qi-host-harddeck qi-mc-shell" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, boxSizing: "border-box" as const, background: "var(--qi-bg-stage)", zIndex: 200, overflow: "hidden" }}>
      <div className="qi-mc-main-column">
        {/* Host request: "all info from top bar has disappeared from the
            screen - it should be on all screens" - Session PIN, TV status,
            Open Display and End quiz used to only exist on the main console;
            this overlay's own slim title row (just below) had none of it, so
            all of it vanished for as long as Hard Deck was running. Reusing
            the exact same top-bar component the main console renders fixes
            that without duplicating its markup here. */}
        <MissionControlTopBar sessionPin={sessionPin} tvStatus={tvStatus} onOpenDiagnostics={onOpenDiagnostics} endQuizLabel={endQuizLabel ?? "End quiz"} onEndQuiz={onEndQuiz ?? closePanel} />
        {nextLabel && (
          <button onClick={nextHandler} disabled={nextDisabled} className="qi-mc-next" style={{ flexShrink: 0 }}>
            <span className="qi-mc-next__eyebrow">Next action</span>
            <span className="qi-mc-next__label">{nextLabel}</span>
            <span className="qi-mc-next__key">Space ↵</span>
          </button>
        )}

        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "14px 24px 6px" }}>
          <div style={{ fontFamily: "'Bruno Ace SC', sans-serif", fontSize: 20, color: "#BE26C1", letterSpacing: 3 }}>THE HARD DECK</div>
          {/* Host request: "team name area is smaller" - bumped from 15px to
              match the weight/size of the round wordmark beside it, so the
              team currently playing reads as clearly as the round name. */}
          {!showWheel && team && <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>Team: <strong style={{ fontWeight: 800 }}>{team}</strong></div>}
        </div>

        {/* Wheel/card sizing below is enlarged - it was a small, fixed-size
            centerpiece floating in a mostly-empty viewport on every screen
            size (phone, iPad, host laptop, venue TV), the "too small for
            every display" report. Sized relative to the actual space
            available in .qi-mc-desk instead of small fixed/capped values. */}
        <main className="qi-mc-desk" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, textAlign: "center" as const }}>
          {showWheel && (
            /* Host: "I have a scroll on this screen. I don't want it. Fit
               in the area we have." The wheel's old size formula used
               window.innerHeight*0.72 - the WHOLE window, not the actual
               room left in .qi-mc-desk once the top bar, Next-Action bar
               and header row are subtracted, so it could be taller than
               its real box and force this panel to scroll. This measures
               the real container (wheelBoxRef, above) instead. */
            <div ref={wheelBoxRef} className="qi-mc-question" style={{ flex: 1, width: "100%", minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <SpinWheel segments={buildTeamSegments(teams.map(t => t.team_name))} onResult={onWheelResult} size={Math.min(560, wheelBoxSize.width * 0.9, wheelBoxSize.height * 0.9) || 320} forceResultIndex={wheelTarget ?? undefined} onSpinStart={() => pushState({ hard_deck_wheel_spinning: true })} />
            </div>
          )}

          {/* Host: "Shrink the question/photos to fit, just like the
              questions/rounds we worked on yesterday. Do same for the Hard
              Deck." This whole block used to be fixed/vw-clamped sizes with
              its own internal 68vh scroll fallback - different content
              could end up a different overall footprint than every other
              round's FitScaleBlock-shrunk question, and a long hand of
              cards would scroll inside its own box rather than shrinking
              like Regular Round's question text does. Wrapping it in the
              same FitScaleBlock, with the card size driven by the same
              --qi-fit-scale variable, makes it shrink (or grow) to exactly
              fill .qi-mc-desk instead. The wrapping .qi-mc-question div
              also matches .qi-mc-desk:has(.qi-mc-question) in globals.css,
              the same selector Regular Round and Pursuit rely on to force
              this desk to clip instead of scroll. */}
          {!showWheel && team && (
            <div className="qi-mc-question" style={{ flex: 1, width: "100%", minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <FitScaleBlock className="qi-hd-inner" minScale={0.4} maxScale={1.6}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "calc(var(--qi-fit-scale,1) * 20px)", textAlign: "center" as const }}>
                  {/* This row shows every card revealed so far this hand (not
                      just the latest one - see task history), so its width
                      keeps growing through a long hand. flexWrap is the
                      primary fix so it reads as a normal multi-row hand
                      instead of needing to scroll at all in the common case. */}
                  <div className="qi-host-harddeck-cards" style={{ padding: "calc(var(--qi-fit-scale,1) * 28px) calc(var(--qi-fit-scale,1) * 32px)", borderRadius: 20, background: "linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))", border: "1px solid rgba(190,38,193,0.25)", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05), inset 0 -1px 20px rgba(0,0,0,0.4), 0 0 30px rgba(190,38,193,0.15)", maxWidth: "90vw" }}>
                    <div style={{ display: "flex", gap: "calc(var(--qi-fit-scale,1) * 16px)", flexWrap: "wrap", justifyContent: "center" }}>
                      {cards.map((c, i) => (
                        <div key={i} style={{ width: "calc(var(--qi-fit-scale,1) * 140px)", height: "calc(var(--qi-fit-scale,1) * 200px)", borderRadius: 16, background: "linear-gradient(160deg, #ffffff 0%, #f2f2f5 100%)", border: "1px solid rgba(0,0,0,0.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -6px 10px rgba(0,0,0,0.05), 0 6px 16px rgba(0,0,0,0.45), 0 0 0 1px rgba(212,175,90,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", fontSize: "calc(var(--qi-fit-scale,1) * 50px)", fontWeight: 700, color: (c.suit === "♥" || c.suit === "♦") ? "#dc2626" : "#111" }}>
                          <div>{rankLabel(c.rank)}</div>
                          <div style={{ fontSize: "calc(var(--qi-fit-scale,1) * 31px)" }}>{c.suit}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {potential > 0 && (status === "decision" || status === "won") && (
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#facc15", letterSpacing: 0.5 }}>Potential: {potential} pts</div>
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
                      <div style={{ color: "#E8C36A", fontSize: 15, fontWeight: 800 }}>Live gamble · {hardDeckGambleStake(potential)} point steal pool</div>
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
                </div>
              </FitScaleBlock>
            </div>
          )}
        </main>
        {/* Host: "add the manual recovery bar and buttons." Matches the
            same .qi-mc-manual bar Regular Round uses, glued to the bottom
            via margin-top:auto as a sibling of .qi-mc-desk (not inside
            it) - the same structural fix that stopped the manual bar from
            floating above a dead gap earlier this session. Resync re-sends
            the exact state already held locally (never a new value), so
            it's safe to press at any point in the hand. */}
        <div className="qi-mc-manual">
          <span className="qi-mc-manual__label">Manual recovery</span>
          <button className="qi-button qi-button--quiet qi-mc-manual__button" onClick={resyncState} disabled={resyncing}>{resyncing ? "Resyncing…" : "Resync Display/Handset"}</button>
          <button className="qi-button qi-button--secondary qi-mc-manual__last" onClick={closePanel}>Close / Skip Round</button>
        </div>
      </div>
      {/* .qi-mc-rail is a direct sibling of .qi-mc-main-column inside the
          .qi-mc-shell grid now (see that class), exactly like the main
          console - NOT a flex sibling of .qi-mc-desk inside a plain
          .qi-mc-workspace row the way this used to be built. That older
          structure never actually gave the rail its fixed
          minmax(360px,29vw) column: .qi-mc-rail's own `grid-column: 2` rule
          only means anything inside a grid parent, so under a flex parent it
          silently fell back to shrink-to-fit content width - with almost no
          content ("Scores will appear here...") that collapsed to a sliver.
          ("team name area is tiny - the area should always be locked".) */}
      <aside className="qi-mc-rail">
        <div className="qi-mc-teams">
          {[...scores].sort((a, b) => b.total_points - a.total_points).map((s, i) => (
            <div key={s.team_name} className="qi-mc-team-card" style={{ gridTemplateColumns: "26px 28px minmax(0, 1fr) auto" }}>
              <span style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>{i + 1}</span>
              <span />
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{s.team_name}</span>
              <span style={{ fontSize: 19, fontWeight: 800 }}>{s.total_points}</span>
            </div>
          ))}
          {scores.length === 0 && (
            <div style={{ padding: "12px 4px", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Scores will appear here once teams have points.</div>
          )}
        </div>
      </aside>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(<>{overlay}{warningPanel}</>, document.body) : null;
}
