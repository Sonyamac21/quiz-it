-- The player handset's "STEAL WON" result was hardcoded to "+2 POINTS",
-- left over from an old point ladder, while the real steal payout
-- (HardDeckPanel's CARD_POINTS, split evenly across every team that steals
-- correctly) had since changed. Persist the actual points awarded on a bust
-- so the handset (and any other surface) can show the real number instead
-- of a stale hardcoded one.
alter table sessions
  add column if not exists hard_deck_steal_points integer not null default 0;
