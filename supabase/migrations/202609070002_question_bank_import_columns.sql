-- Support for bulk-importing external question sets (e.g. SpeedQuizzing
-- archive) into question_bank, gated behind a review flag so nothing
-- imported goes live in a quiz before a human (or the AI staleness pass)
-- has approved it.
--
-- `topic` is added defensively with `if not exists` - the app's library
-- search already queries a `topic` column (app/host/quizzes/page.tsx:267)
-- but no tracked migration ever created it, so it may or may not already
-- exist live. This is safe either way.

alter table public.question_bank
  add column if not exists topic text,
  add column if not exists source text,
  add column if not exists needs_review boolean not null default false,
  add column if not exists stale_risk boolean not null default false,
  add column if not exists review_note text;

create index if not exists question_bank_needs_review_idx
  on public.question_bank (needs_review);

create index if not exists question_bank_topic_idx
  on public.question_bank (topic);
