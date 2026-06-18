-- The Hard Deck round - new columns on sessions table
-- Run this in Supabase: Database -> SQL Editor -> New query -> paste -> Run

alter table public.sessions add column if not exists hard_deck_team text;
alter table public.sessions add column if not exists hard_deck_cards jsonb default '[]'::jsonb;
alter table public.sessions add column if not exists hard_deck_guess text;
alter table public.sessions add column if not exists hard_deck_potential integer default 0;
alter table public.sessions add column if not exists hard_deck_status text;
alter table public.sessions add column if not exists hard_deck_has_swapped boolean default false;
alter table public.sessions add column if not exists hard_deck_wheel_target integer;
