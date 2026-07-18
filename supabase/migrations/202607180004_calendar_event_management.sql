-- Calendar-first event management. All changes are additive so legacy weekday
-- venues and existing events remain valid and keep their current foreign keys.

alter table public.venues
  add column if not exists hero_image_url text,
  add column if not exists gallery_images text[] not null default '{}'::text[],
  add column if not exists google_maps_url text,
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists website text,
  add column if not exists social_links jsonb not null default '{}'::jsonb,
  add column if not exists default_quiz_id uuid references public.quizzes(id) on delete set null,
  add column if not exists default_host_name text,
  add column if not exists default_quiz_day integer check (default_quiz_day between 0 and 6),
  add column if not exists default_end_time time without time zone,
  add column if not exists food_offers text,
  add column if not exists drink_offers text,
  add column if not exists happy_hour text,
  add column if not exists prize_information text,
  add column if not exists sponsors text[] not null default '{}'::text[],
  add column if not exists brand_colours jsonb not null default '{}'::jsonb,
  add column if not exists display_slides text[] not null default '{}'::text[],
  add column if not exists display_adverts text[] not null default '{}'::text[];

alter table public.events
  add column if not exists end_time time without time zone,
  add column if not exists status text not null default 'scheduled'
    check (status in ('draft', 'scheduled', 'live', 'completed', 'cancelled')),
  add column if not exists host_name text,
  add column if not exists special_offers text,
  add column if not exists overrides jsonb not null default '{}'::jsonb,
  add column if not exists recurrence_group_id uuid,
  add column if not exists recurrence_rule jsonb;

update public.events set status = 'completed'
where event_date < current_date and status = 'scheduled';

create index if not exists events_venue_date_idx
  on public.events (venue_record_id, event_date);
create index if not exists events_status_date_idx
  on public.events (status, event_date);
create index if not exists events_recurrence_group_idx
  on public.events (recurrence_group_id)
  where recurrence_group_id is not null;

comment on column public.events.overrides is
  'Event-only differences from the selected venue defaults. Empty means inherit the venue profile.';
comment on column public.events.recurrence_rule is
  'Schedule metadata retained on generated event occurrences; events remain independently editable.';
