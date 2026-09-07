-- Track usage on Question Library rows (question_bank) so a question that
-- has already been played in a live quiz is excluded from future library
-- picks, instead of being offered again indefinitely.

alter table public.question_bank
  add column if not exists times_used integer not null default 0,
  add column if not exists last_used_at timestamptz;

create index if not exists question_bank_times_used_idx
  on public.question_bank (times_used);
