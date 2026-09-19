// Short, static "how to play" blurbs per round_type, for showing players a
// preview of the NEXT round during the intermission break on their handset.
// Deliberately generic/condensed versions of the fuller house-rules copy
// the host sees at round start (buildRules() in app/host/quiz/page.tsx) -
// that version is built from live per-round timer/points config and isn't
// reusable here without duplicating that page's state, so this is a
// separate, simpler, single-source-of-truth lookup by round_type alone.
// Keep in sync with ROUND_TYPE_LABEL in app/host/quiz/page.tsx if a new
// round type is added there.
export const ROUND_TYPE_RULES: Record<string, { label: string; blurb: string }> = {
  regular: {
    label: "General Knowledge",
    blurb: "Standard quiz questions - multiple choice, type-in text, numbers, or put-in-order sequence.",
  },
  multi_tap: {
    label: "Multi Tap",
    blurb: "Each question has several correct answers hidden among decoys. Tap every option you think is correct.",
  },
  music: {
    label: "Music Round",
    blurb: "Listen to the clip, then answer on your phone before the timer runs out.",
  },
  hot_seat: {
    label: "Hot Seat",
    blurb: "Everyone starts with one big buzz button. First team to buzz takes the Hot Seat and answers alone.",
  },
  pursuit: {
    label: "The Pursuit",
    blurb: "Every team races through questions at the same time - each correct answer moves your runner forward. Wrong answers don't eliminate you.",
  },
  bonus: {
    label: "Bonus Round",
    blurb: "An extra round with its own twist - watch the big screen for the details.",
  },
  hard_deck: {
    label: "The Hard Deck",
    blurb: "One team gets picked by the wheel to play. Guess Higher or Lower than the card shown, then Stick with your points or Gamble for more.",
  },
  nearest_wins: {
    label: "Nearest Wins",
    blurb: "Closest guess wins - there's no exact right answer to type in, just your best estimate.",
  },
  pairs: {
    label: "Match Made",
    blurb: "Every handset has the same pictures in its own shuffled order. Tap two pictures that go together.",
  },
  spin_to_win: {
    label: "Spin to Win",
    blurb: "The fastest correct team gets a spin for bonus points on the big screen.",
  },
};

export function getRoundRulesBlurb(roundType: string | null | undefined): { label: string; blurb: string } | null {
  if (!roundType) return null;
  return ROUND_TYPE_RULES[roundType] || null;
}
