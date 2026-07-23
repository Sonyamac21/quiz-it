-- Per-round default points-per-question, so the live host console can
-- auto-load a round's intended points instead of always starting from the
-- flat session default (10) - the manual override input on the host console
-- is unchanged and still works exactly as before. Null means "no round
-- default set - keep using the session default," so this is fully additive
-- and safe for every existing round/quiz/session row.
alter table public.rounds
  add column if not exists points_per_question integer;

alter table public.quiz_rounds
  add column if not exists points_per_question integer;

alter table public.session_rounds
  add column if not exists points_per_question integer;

comment on column public.rounds.points_per_question is
  'Default points awarded for a correct answer in this round. Null = use the session default.';
comment on column public.quiz_rounds.points_per_question is
  'Copied from rounds.points_per_question when a round is added to a quiz.';
comment on column public.session_rounds.points_per_question is
  'Immutable snapshot of quiz_rounds.points_per_question for this live session.';
