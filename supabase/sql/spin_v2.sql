-- Spin to Win v2 - host offers, fastest team chooses Spin or Pass on their phone
alter table public.sessions add column if not exists spin_offered boolean default false;
alter table public.sessions add column if not exists spin_choice text;
