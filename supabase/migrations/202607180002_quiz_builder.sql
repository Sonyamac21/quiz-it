-- Quiz Builder: reusable quizzes, per-quiz round instances, and immutable
-- live-session round snapshots. Existing round/session columns remain intact.

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  venue_id bigint,
  host_id uuid references auth.users(id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_rounds (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  source_round_id uuid references public.rounds(id) on delete set null,
  position integer not null check (position >= 0),
  name text not null,
  round_type text not null default 'regular',
  difficulty text,
  questions jsonb not null default '[]'::jsonb,
  hide_leaderboard boolean not null default false,
  allow_power_cards boolean not null default true,
  notes text,
  sponsor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quiz_id, position)
);

create table if not exists public.session_rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  source_quiz_round_id uuid references public.quiz_rounds(id) on delete set null,
  source_round_id uuid references public.rounds(id) on delete set null,
  position integer not null check (position >= 0),
  name text not null,
  round_type text not null default 'regular',
  difficulty text,
  questions jsonb not null default '[]'::jsonb,
  hide_leaderboard boolean not null default false,
  allow_power_cards boolean not null default true,
  notes text,
  sponsor text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, position)
);

alter table public.sessions
  add column if not exists quiz_id uuid references public.quizzes(id) on delete set null,
  add column if not exists current_session_round_id uuid references public.session_rounds(id) on delete set null;

alter table public.events
  add column if not exists quiz_definition_id uuid references public.quizzes(id) on delete set null;

create index if not exists quiz_rounds_quiz_position_idx on public.quiz_rounds (quiz_id, position);
create index if not exists session_rounds_session_position_idx on public.session_rounds (session_id, position);

alter table public.quizzes enable row level security;
alter table public.quiz_rounds enable row level security;
alter table public.session_rounds enable row level security;

create policy "Hosts manage their quizzes" on public.quizzes
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Hosts manage their quiz rounds" on public.quiz_rounds
  for all to authenticated
  using (exists (select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = auth.uid()))
  with check (exists (select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = auth.uid()));
create policy "Hosts manage session round snapshots" on public.session_rounds
  for all to authenticated
  using (exists (
    select 1 from public.sessions s
    join public.quizzes q on q.id = s.quiz_id
    where s.id = session_id and q.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.sessions s
    join public.quizzes q on q.id = s.quiz_id
    where s.id = session_id and q.owner_id = auth.uid()
  ));

comment on table public.quiz_rounds is 'Editable per-quiz snapshots of reusable library rounds.';
comment on table public.session_rounds is 'Immutable ordered round snapshots used by a running session.';
