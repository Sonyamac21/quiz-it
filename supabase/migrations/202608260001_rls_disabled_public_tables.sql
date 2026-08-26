-- Fixes 3 "RLS Disabled in Public" errors flagged by Supabase's Security
-- Advisor: game_history, venue_offers, and media_assets were all created
-- directly in the dashboard/SQL editor at some point (never through a
-- tracked migration) and never had Row-Level Security turned on at all -
-- meaning anyone with the project's anon key (which is public, it's shipped
-- in the browser bundle of every page) could read, edit, or delete every
-- row in these tables directly, with no policy checking who they are.
--
-- Each table gets exactly the access its actual usage in the app needs,
-- checked against every .from("game_history"/"venue_offers"/"media_assets")
-- call in the codebase before writing these policies:
--
--   game_history  - written once by Mission Control when a live quiz ends
--                    (app/host/quiz/page.tsx), NEVER read back anywhere in
--                    the app. Authenticated-insert-only; no select policy
--                    at all, so it's fully locked down for reads (RLS
--                    defaults to deny when no policy matches).
--
--   media_assets  - written once by Music Prep when a trimmed audio clip is
--                    saved (app/host/music-prep/page.tsx), same as above -
--                    never read back anywhere. Same treatment.
--
--   venue_offers  - the one exception: it's written by the host (Venues
--                    page CRUD) but also READ by anonymous players with no
--                    login at all, via lib/venueOffers.ts's
--                    fetchActiveVenueOffers(), which both the display
--                    screen and player handsets call during intermission.
--                    So this needs a public read policy alongside
--                    authenticated-only writes - unlike the other two, a
--                    fully locked-down read policy here would silently
--                    break the offers rotation for every player mid-quiz.

alter table public.game_history enable row level security;
drop policy if exists "Hosts can log game history" on public.game_history;
create policy "Hosts can log game history"
  on public.game_history for insert
  to authenticated
  with check (true);

alter table public.media_assets enable row level security;
drop policy if exists "Hosts can log media assets" on public.media_assets;
create policy "Hosts can log media assets"
  on public.media_assets for insert
  to authenticated
  with check (true);

alter table public.venue_offers enable row level security;
drop policy if exists "Anyone can read active venue offers" on public.venue_offers;
create policy "Anyone can read active venue offers"
  on public.venue_offers for select
  using (true);
drop policy if exists "Hosts can manage venue offers" on public.venue_offers;
create policy "Hosts can manage venue offers"
  on public.venue_offers for all
  to authenticated
  using (true)
  with check (true);
