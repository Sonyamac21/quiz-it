-- Codex pre-launch review, finding #8: display updates have no ordering
-- protection.
--
-- The display screen applies whichever `sessions` snapshot arrives last,
-- from either realtime or a periodic poll, with no check that it's actually
-- newer than what's already showing. A slower poll response landing after a
-- faster realtime update can overwrite it with stale data - the review
-- specifically noted the spin_to_win nonce guard doesn't protect against an
-- old snapshot that still has phase = 'spin_to_win' being re-applied.
--
-- Rather than relying on every write path across the app (host quiz page,
-- session page, display page, UnoCards, scoreService) to remember to set a
-- revision column by hand, a trigger makes `updated_at` automatic and
-- impossible to forget on any current or future write.
alter table public.sessions
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sessions_set_updated_at on public.sessions;
create trigger sessions_set_updated_at
  before update on public.sessions
  for each row
  execute function public.set_sessions_updated_at();

comment on column public.sessions.updated_at is 'Auto-maintained by the sessions_set_updated_at trigger on every UPDATE - used by the display screen to discard a snapshot that arrives out of order (e.g. a slow poll response landing after a newer realtime update already applied).';
