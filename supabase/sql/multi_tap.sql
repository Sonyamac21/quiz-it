-- Multi Tap round - new columns on question_bank table
alter table public.question_bank add column if not exists option_e text;
alter table public.question_bank add column if not exists option_f text;
