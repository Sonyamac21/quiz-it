-- Promo Images (venue_offers) used to rotate on the handset only. The host
-- wants two genuinely separate sections to manage - one set of images for
-- player handsets, a different set for the Display screen - rather than one
-- pool that shows everywhere. This column is how a row picks its target(s).
alter table public.venue_offers
  add column if not exists surface text not null default 'handset';

alter table public.venue_offers
  drop constraint if exists venue_offers_surface_check;
alter table public.venue_offers
  add constraint venue_offers_surface_check check (surface in ('handset','display','both'));
