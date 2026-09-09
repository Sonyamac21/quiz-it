-- A handset may retry an INSERT when venue wifi briefly drops. Keep the first
-- locked answer authoritative and make identical retry requests harmless.
--
-- round_number remains nullable so historical rows (which only carried a
-- question_index that restarted at zero every round) are preserved unchanged.
alter table public.answers
  add column if not exists round_number integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'answers_one_per_round_question'
      and conrelid = 'public.answers'::regclass
  ) then
    alter table public.answers
      add constraint answers_one_per_round_question
      unique (session_pin, team_name, round_number, question_index);
  end if;
end
$$;

comment on column public.answers.round_number is
  'Round scope for durable one-answer-per-team-per-question idempotency. Historical rows may be null.';
