-- Codex pre-launch review, finding #2 (host refresh loses round boundary)
-- and #7 (display "Locked In" mixes answers across rounds).
--
-- The host page tracked "when did the current round start" purely in a
-- React ref (roundStartedRef), used to filter out stale answers from a
-- previous round (question indexes restart at 0 every round, so without
-- this filter an old answer with the same index as the current question
-- could get pulled into scoring). A browser refresh reset that ref back to
-- 0, silently disabling the filter entirely until the next round start.
alter table public.sessions
  add column if not exists round_started_at timestamptz;

comment on column public.sessions.round_started_at is 'Wall-clock time the current round started, persisted so a host/display refresh can restore the round boundary used to filter out answers left over from a previous round with the same question index.';
