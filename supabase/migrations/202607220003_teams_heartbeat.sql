-- Presence/heartbeat foundation. Previously "connected" for a team meant only
-- "a row exists in teams" - set once at join and never re-verified. The host
-- diagnostics panel had no real signal and showed static placeholder text
-- ("Heartbeat data unavailable" / "Client telemetry unavailable"). This adds
-- a last_seen_at timestamp that the handset refreshes periodically, so the
-- host can tell a team apart from a team whose handset has actually dropped.
-- Purely additive - nullable-with-default, no backfill required for existing
-- rows to keep working, no RLS/scoring/timer change.

alter table public.teams
  add column if not exists last_seen_at timestamptz not null default now();

comment on column public.teams.last_seen_at is
  'Last time this team''s handset checked in. Refreshed by the player app on its session poll and on visibility/focus. Used by host diagnostics to distinguish a live handset from a stale team row.';
