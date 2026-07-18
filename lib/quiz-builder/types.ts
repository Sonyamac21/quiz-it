export type LibraryRound = {
  id: string;
  name: string;
  round_type: string;
  difficulty: string | null;
  questions: Record<string, unknown>[];
  hide_leaderboard: boolean;
  allow_power_cards: boolean;
};

export type QuizRound = LibraryRound & {
  source_round_id: string | null;
  position: number;
  notes?: string | null;
  sponsor?: string | null;
};

export type QuizDefinition = {
  id: string;
  name: string;
  description: string | null;
  venue_id: number | null;
  host_id: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  quiz_rounds: QuizRound[];
};
