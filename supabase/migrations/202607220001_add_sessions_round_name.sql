-- Fix production bug: sessions.round_name is read by the handset's session
-- poll (components/PlayerQuizScreen.tsx fetchSession) and written by the host
-- on round start (app/host/quiz/page.tsx doStartRound), but the column was
-- never migrated into the live schema. Every handset poll was failing with
-- Postgres 42703 "column sessions.round_name does not exist" on every
-- request, tripping the handset's 3-strike connectionLost check within
-- ~1.5s of joining ("Connection Lost" screen) while the host silently lost
-- the round_name (and the rest of the same update statement) on every round
-- start. Purely additive - nullable, no backfill, no RLS/realtime change.

alter table public.sessions
  add column if not exists round_name text;

comment on column public.sessions.round_name is
  'Display name of the currently active round, written by the host on round start and read by the handset/display session poll.';
