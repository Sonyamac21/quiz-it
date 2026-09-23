-- intermission_other_quizzes was already read and rendered on both the
-- Display screen and the player handset (the "MORE QUIZ NIGHTS" card), but
-- nothing anywhere ever wrote that session column - no venue field, no
-- session-creation write. The card was permanently dead for every venue.
-- Additive/nullable - existing venues with nothing set just keep skipping
-- the card, exactly as before.
alter table public.venues
  add column if not exists other_quizzes_text text;

-- WhatsApp group join: this is one setting per HOST ACCOUNT, not per venue -
-- a host runs one community WhatsApp group across every venue they quiz at,
-- so it belongs alongside the host's own account settings rather than being
-- re-entered on every venue profile. One row per host, matching the
-- owner_id + RLS pattern already used on venues (202609120001_venues_owner_
-- scoping.sql) since multi-host data isolation is in progress and this must
-- never leak one host's group link to another host's account.
create table if not exists public.host_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  whatsapp_link text,
  updated_at timestamptz not null default now()
);

alter table public.host_settings enable row level security;

drop policy if exists "Hosts manage their own settings" on public.host_settings;
create policy "Hosts manage their own settings" on public.host_settings
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

comment on table public.host_settings is
  'One row per host account for account-wide settings (currently just the WhatsApp group invite link, shown on the Display screen and player handset during intermission across every venue this host runs).';
