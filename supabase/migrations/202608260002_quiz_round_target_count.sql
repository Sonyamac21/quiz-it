-- Persists the "how many questions should this round have" target that the
-- Quiz Plan builder's Generate-All panel lets a host set per round (e.g.
-- Hot Seat = 5, Bonus = 5). Previously this only ever lived in React state
-- (bulkConfig in app/host/quizzes/page.tsx), reset back to
-- `round.questions.length || 10` on every page load/reload - so a host who
-- set a round's target below the generic default of 10 had it silently
-- forgotten the moment they navigated away and came back, and the next
-- Generate All run would ask for 10 again instead of the number they'd
-- actually chosen.
alter table public.quiz_rounds
  add column if not exists target_count integer;

comment on column public.quiz_rounds.target_count is 'Host-chosen "how many questions should this round have" target used by Generate All / generate-more. Null means no explicit target has been set yet (falls back to current question count or 10 in the UI).';
