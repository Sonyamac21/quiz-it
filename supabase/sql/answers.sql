-- Run in Supabase SQL Editor if the answers table does not exist yet

create table public.answers (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  team_name text not null,
  question_id bigint not null references public.questions (id),
  selected_answer text not null,
  is_correct boolean not null,
  constraint answers_selected_answer_check
    check (selected_answer in ('a', 'b', 'c', 'd'))
);

create index answers_team_question_idx
  on public.answers (team_name, question_id);

-- Allow players to submit answers (adjust if you add auth later)
-- create policy "Allow anonymous answer inserts"
-- on public.answers for insert to anon with check (true);
