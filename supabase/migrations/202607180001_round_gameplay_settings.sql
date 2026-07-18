-- Persist per-round audience visibility and Power Card availability.
-- The live session mirrors the selected round so displays and handsets retain
-- the rules across refreshes and reconnects without changing scoring logic.

alter table public.rounds
  add column if not exists hide_leaderboard boolean not null default false,
  add column if not exists allow_power_cards boolean not null default true;

alter table public.sessions
  add column if not exists hide_leaderboard boolean not null default false,
  add column if not exists allow_power_cards boolean not null default true;

comment on column public.rounds.hide_leaderboard is
  'When true, leaderboard surfaces are unavailable while this round is active.';
comment on column public.rounds.allow_power_cards is
  'When false, teams retain unused Power Cards but cannot play them during this round.';
comment on column public.sessions.hide_leaderboard is
  'Runtime mirror of the active round hide_leaderboard setting.';
comment on column public.sessions.allow_power_cards is
  'Runtime mirror of the active round allow_power_cards setting.';
