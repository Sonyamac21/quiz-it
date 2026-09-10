-- Apply before deploying the independent audience controls.
-- Keep show_scoreboard as the existing handset flag. Do not change live phases.
alter table public.sessions
  add column if not exists show_scoreboard_on_display boolean not null default false;
