-- The new auto-generated "venue experience" pre-show scenes (prizes,
-- schedule, host, socials) need a host photo to go with the venue's
-- default_host_name. Additive/nullable - venues with no photo set just
-- skip that scene instead of showing a broken image.
alter table public.venues
  add column if not exists host_photo_url text;
