-- Run this in Supabase SQL Editor (Database → SQL Editor → New query)

create table public.questions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_answer text not null,
  round_number integer not null,
  question_number integer not null,
  constraint questions_correct_answer_check
    check (correct_answer in ('a', 'b', 'c', 'd'))
);

comment on table public.questions is 'Quiz questions for Quiz-It';

create index questions_round_question_idx
  on public.questions (round_number, question_number);
