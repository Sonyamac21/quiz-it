-- The Pursuit round - new columns on the sessions table (Phase 1: architecture only)
-- Run this in Supabase: Database -> SQL Editor -> New query -> paste -> Run
--
-- These columns are the authoritative live state for a Pursuit round, mirroring
-- the hard_deck_* pattern. No gameplay values are computed yet; Phase 2 fills them.

alter table public.sessions add column if not exists pursuit_status text;
alter table public.sessions add column if not exists pursuit_team text;
alter table public.sessions add column if not exists pursuit_bid integer default 0;
alter table public.sessions add column if not exists pursuit_runner text;
alter table public.sessions add column if not exists pursuit_potential integer default 0;
alter table public.sessions add column if not exists pursuit_position integer default 0;
alter table public.sessions add column if not exists pursuit_cashed_out boolean default false;
alter table public.sessions add column if not exists pursuit_result text;
alter table public.sessions add column if not exists pursuit_data jsonb default '{}'::jsonb;
