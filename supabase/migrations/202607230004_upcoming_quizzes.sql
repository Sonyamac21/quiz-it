-- Auto-generated "upcoming quizzes" cards on the player handset during
-- breaks. Snapshotted onto the session at creation from the host's own
-- Calendar (public.events) - no manual upload step, matching the "auto-built
-- from Calendar" requirement. Same pattern as intermission_offers/
-- intermission_photos: read once at session start, no live Calendar lookup
-- needed from the handset.
alter table public.sessions
  add column if not exists upcoming_quizzes jsonb not null default '[]';

comment on column public.sessions.upcoming_quizzes is
  'Snapshot of the next few scheduled events (venue_name, event_date, start_time) at session creation, shown as rotating cards on the handset during intermission.';
