-- Match Made previously re-did the full search-and-verify gamble for every
-- single image on every single generation, even for an object that had
-- already been successfully verified before - "guitar" succeeding last week
-- bought nothing towards tonight's "guitar" needing the same live search +
-- AI vision check gamble all over again. That's the real cost AND
-- reliability problem: every image is paid for and risked fresh, forever,
-- with no memory of past success.
--
-- This table is that memory. Once an item's picture clears the identity
-- check, it's saved here permanently and reused for free and instantly the
-- next time the same label comes up, with no live search or AI call at all.
-- Coverage grows automatically just from normal use - the more Match Made
-- gets generated, the cheaper and more reliable it gets, converging toward
-- a curated content library the same way a competitor's static question
-- bank works, except this one builds itself.
--
-- Generation is host-only and always runs client-side in the host's
-- browser (see generatePairs.ts's own comments on why), so this follows the
-- same authenticated-only pattern as media_assets in
-- 202608260001_rls_disabled_public_tables.sql: never read or written by the
-- anonymous player/join flow, so no public policy is needed.
create table if not exists public.pairs_image_cache (
  id uuid primary key default gen_random_uuid(),
  label_key text not null,
  label text not null,
  image_url text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists pairs_image_cache_label_key_idx on public.pairs_image_cache (label_key);

alter table public.pairs_image_cache enable row level security;

drop policy if exists "Hosts can browse the pairs image cache" on public.pairs_image_cache;
create policy "Hosts can browse the pairs image cache"
  on public.pairs_image_cache for select
  to authenticated
  using (true);

drop policy if exists "Hosts can add to the pairs image cache" on public.pairs_image_cache;
create policy "Hosts can add to the pairs image cache"
  on public.pairs_image_cache for insert
  to authenticated
  with check (true);

drop policy if exists "Hosts can update pairs image cache recency" on public.pairs_image_cache;
create policy "Hosts can update pairs image cache recency"
  on public.pairs_image_cache for update
  to authenticated
  using (true)
  with check (true);
