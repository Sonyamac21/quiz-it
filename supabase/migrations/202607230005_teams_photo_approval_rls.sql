-- The host's Photo approval panel updates teams.photo_approved (and clears
-- photo_url on reject) from the same anon-key browser client as everything
-- else on the host console. If `teams` has no permissive UPDATE policy
-- covering this (only an INSERT policy for the join flow, say), that update
-- silently matches zero rows instead of erroring - it looked like Approve
-- worked, then the photo reappeared in the queue on the next poll, forever.
-- This policy is additive: RLS policies for the same command are OR'd
-- together, so this only ever grants more access, never revokes anything
-- already working.
drop policy if exists "Host can approve or reject team photos" on public.teams;
create policy "Host can approve or reject team photos" on public.teams
  for update using (true) with check (true);
