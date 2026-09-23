-- Live bug: joining a quiz failed with "new row violates row-level security
-- policy for table \"teams\"" on the actual join page (app/join/join-form.tsx,
-- handleJoin()) - a fully anonymous player, never logged in, inserting their
-- own team row with the public anon key. That's the normal, intended join
-- path for every quiz this app runs.
--
-- Unlike the game_history/media_assets/venue_offers RLS gaps fixed in
-- 202608260001_rls_disabled_public_tables.sql, this isn't a table that never
-- had RLS enabled - it's a table that already has other policies (see
-- 202607230005_teams_photo_approval_rls.sql and
-- 202608270003_photo_moderation_host_only.sql, both UPDATE-only, both
-- created directly in the Supabase dashboard rather than through a tracked
-- migration - same as this one turns out to need). RLS defaults to deny
-- when no policy matches a given command, and no INSERT policy for `teams`
-- has ever existed in a tracked migration - it must have been created (or
-- since removed/tightened) directly in the dashboard at some point outside
-- version control, which is exactly why this went unnoticed here until it
-- broke live.
--
-- This grants the one thing the actual join flow needs: any anonymous or
-- authenticated caller can insert a new team row. No session_pin ownership
-- check is possible here since players never authenticate at all - the
-- app's existing duplicate-name/duplicate-song checks and the
-- teams_session_song_uidx unique index (see
-- 202608170001_teams_unique_song_per_session.sql) are what actually keep
-- one session's teams sane, not RLS. Additive only, like the sibling
-- policies above: this can only grant access, never revoke anything.
drop policy if exists "Anyone can join a quiz" on public.teams;
create policy "Anyone can join a quiz"
  on public.teams for insert
  with check (true);
