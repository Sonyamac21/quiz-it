"use client";
import { useState, useRef } from "react";

export type PlayingCard = { rank: number; suit: "\u2660" | "\u2665" | "\u2666" | "\u2663" };

const SUITS: PlayingCard["suit"][] = ["\u2660", "\u2665", "\u2666", "\u2663"];
const RANK_LABELS: Record<number, string> = {
  1: "A", 11: "J", 12: "Q", 13: "K",
};
export function rankLabel(rank: number): string {
  return RANK_LABELS[rank] || String(rank);
}

function rankValue(rank: number): number {
  return rank === 1 ? 14 : rank;
}

function buildDeck(): PlayingCard[] {
  const deck: PlayingCard[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ rank, suit });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export const POINTS_LADDER = [5, 10, 20, 40];

export type Guess = "higher" | "lower";
export type RoundOutcome = "win" | "lose" | "tie";

export function evaluateGuess(prevCard: PlayingCard, nextCard: PlayingCard, guess: Guess): RoundOutcome {
  const prev = rankValue(prevCard.rank);
  const next = rankValue(nextCard.rank);
  if (prev === next) return "tie";
  if (guess === "higher") return next > prev ? "win" : "lose";
  return next < prev ? "win" : "lose";
}

interface UsePlayYourCardsRight {
  cards: PlayingCard[];
  cardIndex: number;
  potential: number;
  status: "dealing_base" | "base_revealed" | "awaiting_guess" | "revealing" | "decision" | "won" | "lost";
  hasSwapped: boolean;
  drawBaseCard: () => void;
  keepBaseCard: () => void;
  swapBaseCard: () => void;
  submitGuess: (guess: Guess) => void;
  revealNext: () => RoundOutcome;
  stick: () => number;
  gamble: () => void;
  reset: () => void;
}

export function usePlayYourCardsRight(): UsePlayYourCardsRight {
  const deckRef = useRef<PlayingCard[]>([]);
  const [cards, setCards] = useState<PlayingCard[]>([]);
  const [potential, setPotential] = useState(0);
  const [status, setStatus] = useState<UsePlayYourCardsRight["status"]>("dealing_base");
  const [hasSwapped, setHasSwapped] = useState(false);
  const guessRef = useRef<Guess | null>(null);

  function reset() {
    deckRef.current = buildDeck();
    setCards([]);
    setPotential(0);
    setStatus("dealing_base");
    setHasSwapped(false);
    guessRef.current = null;
  }

  function drawBaseCard() {
    if (deckRef.current.length === 0) deckRef.current = buildDeck();
    const card = deckRef.current.pop()!;
    setCards([card]);
    setStatus("base_revealed");
  }

  function keepBaseCard() {
    setStatus("awaiting_guess");
  }

  function swapBaseCard() {
    if (hasSwapped) return;
    const oldCard = cards[0];
    const newCard = deckRef.current.pop()!;
    void oldCard;
    setCards([newCard]);
    setHasSwapped(true);
    setStatus("awaiting_guess");
  }

  function submitGuess(guess: Guess) {
    guessRef.current = guess;
  }

  function revealNext(): RoundOutcome {
    const prevCard = cards[cards.length - 1];
    const nextCard = deckRef.current.pop()!;
    const guess = guessRef.current;
    setCards(prev => [...prev, nextCard]);
    if (!guess) {
      setStatus("lost");
      return "lose";
    }
    const outcome = evaluateGuess(prevCard, nextCard, guess);
    guessRef.current = null;
    if (outcome === "win") {
      const cardNumber = cards.length + 1;
      const ladderIndex = cardNumber - 2;
      const newPotential = POINTS_LADDER[ladderIndex] ?? POINTS_LADDER[POINTS_LADDER.length - 1];
      setPotential(newPotential);
      if (cardNumber >= 5) {
        setStatus("won");
      } else {
        setStatus("decision");
      }
    } else {
      setPotential(0);
      setStatus("lost");
    }
    return outcome;
  }

  function stick(): number {
    setStatus("won");
    return potential;
  }

  function gamble() {
    setStatus("awaiting_guess");
  }

  return { cards, cardIndex: cards.length - 1, potential, status, hasSwapped, drawBaseCard, keepBaseCard, swapBaseCard, submitGuess, revealNext, stick, gamble, reset };
}
