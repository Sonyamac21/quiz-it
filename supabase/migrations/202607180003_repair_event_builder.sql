-- Upgrade legacy weekday venue slots into addressable venue records and let an
-- event freeze its complete preparation context into a live session.

alter table public.venues
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists address text,
  add column if not exists active boolean not null default true,
  add column if not exists default_start_time time without time zone,
  add column if not exists default_host_id uuid references auth.users(id) on delete set null,
  add column if not exists default_brand_kit text,
  add column if not exists default_music_pack text,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists venues_id_uidx on public.venues (id);

alter table public.events
  add column if not exists venue_record_id uuid references public.venues(id) on delete restrict;

alter table public.sessions
  add column if not exists event_id uuid references public.events(id) on delete set null,
  add column if not exists venue_record_id uuid references public.venues(id) on delete set null,
  add column if not exists quiz_plan_name text,
  add column if not exists event_snapshot jsonb not null default '{}'::jsonb;

comment on table public.quizzes is 'Saved Quiz Plans containing ordered reusable round instances.';
comment on column public.events.quiz_definition_id is 'Selected Quiz Plan. Legacy quiz_id remains a direct round reference.';
comment on column public.sessions.event_snapshot is 'Frozen event, venue, and Quiz Plan metadata for the running show.';
