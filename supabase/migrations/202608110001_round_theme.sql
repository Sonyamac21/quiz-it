-- Persist the theme/category a round was generated with (e.g. "kids",
-- "80s music") on the round row itself. Previously the theme a host typed
-- into a round's Settings panel only lived in transient page state
-- (bulkConfig), so it reset to blank on every reload/reselect and the
-- SWAP (regenerate one question) action silently regenerated with no theme
-- at all - explaining why a "Bonus Round - kids" ended up with unrelated
-- content after a swap or a fresh page load. Storing it on the row makes it
-- survive reloads and lets every generation path (single round, Generate
-- All, and single-question SWAP) agree on the same theme.
alter table public.quiz_rounds
  add column if not exists theme text;

alter table public.rounds
  add column if not exists theme text;

alter table public.session_rounds
  add column if not exists theme text;
