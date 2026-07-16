-- Phase 1 Events foundation.
-- Existing quiz content is stored in public.rounds, so events.quiz_id points to
-- that table rather than duplicating quiz or round data.

create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (char_length(trim(event_name)) > 0),
  venue_id integer not null,
  event_date date not null,
  start_time time without time zone not null,
  host_id uuid not null,
  quiz_id uuid,
  brand_kit text,
  music_pack text,
  sponsors text[] not null default '{}'::text[],
  prizes text,
  power_cards boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_venue_id_fkey
    foreign key (venue_id) references public.venues (day_of_week)
    on update cascade on delete restrict,
  constraint events_host_id_fkey
    foreign key (host_id) references auth.users (id)
    on update cascade on delete restrict,
  constraint events_quiz_id_fkey
    foreign key (quiz_id) references public.rounds (id)
    on update cascade on delete set null
);

create index if not exists events_date_time_idx
  on public.events (event_date, start_time);

create index if not exists events_host_date_idx
  on public.events (host_id, event_date);

alter table public.events enable row level security;

create policy "Hosts can read their own events"
  on public.events for select
  to authenticated
  using (host_id = auth.uid());

create policy "Hosts can create their own events"
  on public.events for insert
  to authenticated
  with check (host_id = auth.uid());

create policy "Hosts can update their own events"
  on public.events for update
  to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

create policy "Hosts can delete their own events"
  on public.events for delete
  to authenticated
  using (host_id = auth.uid());

