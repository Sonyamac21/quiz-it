-- Venue offer/gallery photos, snapshotted onto the session the same way
-- intermission_offers already is (see app/host/session/page.tsx) - set once
-- at session creation from the venue profile's own gallery_images, so the
-- display never needs to look the venue up again mid-show.
alter table public.sessions
  add column if not exists intermission_photos text[] not null default '{}';

comment on column public.sessions.intermission_photos is
  'Snapshot of venues.gallery_images at session creation - shown in a rotating gallery on the display during intermission, alongside approved customer photos from session_photos.';
