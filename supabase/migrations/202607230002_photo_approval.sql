-- Photo approval gate. Nothing a customer uploads - team join photos or
-- quiz-night photos - may reach the handset badge, the winner reveal, or any
-- future display gallery until a host explicitly approves it. This is a
-- safety requirement, not a display preference: every read path that shows a
-- customer photo must filter on the approved flag, the same discipline
-- SpeedQuizzing already applies.

-- Existing team join photos (components/PlayerQuizScreen.tsx / app/join)
-- previously had no moderation step at all - this column closes that gap.
-- Defaults to false so every future insert starts hidden; existing rows are
-- backfilled to false too (an already-live photo was never actually
-- reviewed, so it must not be grandfathered in as approved).
alter table public.teams
  add column if not exists photo_approved boolean not null default false;

-- Quiz-night photo uploads (a new capture point, not the join-time photo).
-- Kept as its own table rather than overloading `teams` - a team can submit
-- more than one photo during a night, each moderated independently.
create table if not exists public.session_photos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  session_pin text not null,
  team_name text not null,
  photo_url text not null,
  approved boolean not null default false,
  rejected boolean not null default false,
  moderated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists session_photos_session_idx on public.session_photos (session_id, created_at);
create index if not exists session_photos_pin_idx on public.session_photos (session_pin);

alter table public.session_photos enable row level security;

-- Matches the existing trust model for live-session tables (sessions, teams,
-- answers): both anonymous players (uploading) and hosts (moderating) reach
-- this table through the anon client with no per-row ownership check, scoped
-- only by knowing the session PIN.
create policy "Anyone can read session photos" on public.session_photos
  for select using (true);
create policy "Anyone can submit session photos" on public.session_photos
  for insert with check (true);
create policy "Anyone can moderate session photos" on public.session_photos
  for update using (true);

comment on column public.teams.photo_approved is
  'Host must approve a team''s join photo before it appears on the handset badge, display, or anywhere else.';
comment on table public.session_photos is
  'Quiz-night photo uploads awaiting/receiving host moderation. Never shown anywhere until approved = true.';
