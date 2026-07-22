-- Fix production bug: sessions.round_number is written by the host in three
-- places (app/host/quiz/page.tsx doStartRound, doSendQuestion, and the round
-- selection handler) and read on the host and display screens, but the
-- column was never migrated into the live schema - the same class of gap as
-- round_name (202607220001). Because PostgREST rejects an entire update
-- statement if any named column doesn't exist, doStartRound's update -
-- which also carries phase, fastest_team, hide_leaderboard and
-- allow_power_cards - has been silently failing on every round start.
-- Purely additive - nullable, no backfill, no RLS/realtime change.

alter table public.sessions
  add column if not exists round_number integer;

comment on column public.sessions.round_number is
  'Position of the currently active round (1-based), written by the host on round start/selection and read by the host and display screens.';
