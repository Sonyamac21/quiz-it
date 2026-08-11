-- Rounds generated inside a Quiz Plan (quiz_rounds table) previously never
-- appeared in the standalone Round Library (rounds table) at all - the two
-- were completely separate tables with no link between them. This adds:
--   1. synced_from_quiz_round_id - lets the app upsert a Round Library copy
--      of a Quiz Plan round without creating duplicates every time it's
--      regenerated.
--   2. folder - a lightweight grouping label so auto-synced rounds can be
--      tucked into a "<Quiz Plan name>" section instead of flooding the
--      main Round Library list. Manually created library rounds are
--      unaffected (folder stays null, so they keep showing in "All Rounds"
--      exactly as before).
alter table public.rounds
  add column if not exists synced_from_quiz_round_id uuid references public.quiz_rounds(id) on delete set null;

alter table public.rounds
  add column if not exists folder text;

create unique index if not exists rounds_synced_from_quiz_round_id_key
  on public.rounds (synced_from_quiz_round_id)
  where synced_from_quiz_round_id is not null;
