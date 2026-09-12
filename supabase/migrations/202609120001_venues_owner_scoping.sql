-- Multi-host data isolation, step 1 of 5 (see
-- docs/product/multi-host-data-isolation-scoping.md): `venues` currently has
-- no ownership column and no per-host RLS at all - every logged-in host (and,
-- if RLS is currently disabled on this table, possibly every anonymous
-- caller too) can read, edit, and delete every venue in the table. This adds
-- the same owner_id + RLS pattern already proven correct on `quizzes`
-- (202607180002_quiz_builder.sql).
--
-- Safe for the current single-host reality: the backfill assigns every
-- existing venue to whichever auth.users row is oldest, which today is the
-- only account that exists (Sonya's), so nothing changes about what she can
-- see or do. It only starts mattering once a second host account exists.
--
-- IMPORTANT - run this in the Supabase SQL editor, but first check
-- Database > Policies > venues in the dashboard for any existing policy.
-- If one already grants `authenticated` broad access (e.g. "using (true)"
-- on select/update/delete), drop it explicitly by its real name before or
-- after running this - RLS policies for the same command are OR'd together,
-- so leaving an old "using (true)" policy in place would silently let the
-- new owner-scoped policy do nothing.

alter table public.venues
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

update public.venues
  set owner_id = (select id from auth.users order by created_at asc limit 1)
  where owner_id is null;

alter table public.venues
  alter column owner_id set not null,
  alter column owner_id set default auth.uid();

alter table public.venues enable row level security;

drop policy if exists "Hosts manage their venues" on public.venues;
create policy "Hosts manage their venues" on public.venues
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

comment on column public.venues.owner_id is
  'The host account this venue belongs to. Backfilled to the sole existing host at migration time - every venue created from here on gets the creating host''s auth.uid() automatically via the column default.';
