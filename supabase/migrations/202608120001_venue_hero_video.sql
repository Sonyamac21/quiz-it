-- The venue "showreel" on the display screen (pre-show + intermission) needs
-- a short branded video per venue, separate from the existing static Hero
-- Image. Additive/nullable - existing venues with no video just fall back
-- to showing their Hero Image instead, so nothing breaks for venues that
-- haven't uploaded one yet.
alter table public.venues
  add column if not exists hero_video_url text;
