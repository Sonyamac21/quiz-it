export type EventRecord = {
  id: string;
  event_name: string;
  venue_id: number;
  venue_record_id: string | null;
  event_date: string;
  start_time: string;
  host_id: string;
  quiz_id: string | null;
  quiz_definition_id: string | null;
  brand_kit: string | null;
  music_pack: string | null;
  sponsors: string[];
  prizes: string | null;
  power_cards: boolean;
  notes: string | null;
  venue: { venue_name: string; address?: string | null } | null;
  quiz: { name: string } | null;
};

export type EventVenue = {
  id: string;
  day_of_week: number;
  venue_name: string;
  address: string | null;
  default_start_time: string | null;
  default_host_id: string | null;
  default_brand_kit: string | null;
  default_music_pack: string | null;
};

export type EventQuiz = {
  id: string;
  name: string;
  quiz_rounds: { id: string; position: number; name: string; round_type: string; questions: unknown[]; hide_leaderboard: boolean; allow_power_cards: boolean }[];
};

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatEventDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function formatEventTime(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
