-- Codex pre-launch review, finding #5: anonymous clients can approve or
-- reject uploaded photographs.
--
-- session_photos' UPDATE policy and teams' photo-approval UPDATE policy
-- were both written as `using (true) with check (true)` with no role
-- restriction at all - not even scoped to the session's own PIN. Anyone
-- with the app's public anon key (shipped in every page's browser bundle,
-- not a secret) could approve inappropriate content, reject a team's
-- photo, or clear it, for ANY session, without ever logging in.
--
-- The actual moderation UI (components/PhotoApprovalPanel.tsx) is only
-- ever reached from app/host pages, which require a real logged-in host
-- session - the player-facing upload path (components/player/
-- TeamPhotoUpload.tsx) only ever INSERTs, never UPDATEs. So restricting
-- these two UPDATE policies to `authenticated` matches how the app is
-- actually used and closes the gap; nothing player-facing depends on an
-- anonymous client being able to update these rows.
drop policy if exists "Anyone can moderate session photos" on public.session_photos;
create policy "Hosts can moderate session photos" on public.session_photos
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Host can approve or reject team photos" on public.teams;
create policy "Hosts can approve or reject team photos" on public.teams
  for update
  to authenticated
  using (true)
  with check (true);
