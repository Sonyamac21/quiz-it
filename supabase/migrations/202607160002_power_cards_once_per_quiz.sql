-- Each individual Power Card is single-use per team for the lifetime of a quiz
-- session. Keep the earliest play if legacy data contains duplicates, then make
-- the rule authoritative at the database boundary for all clients.
delete from public.uno_cards newer
using public.uno_cards earlier
where newer.session_pin = earlier.session_pin
  and newer.team_name = earlier.team_name
  and newer.card_type = earlier.card_type
  and (
    newer.played_at > earlier.played_at
    or (newer.played_at = earlier.played_at and newer.id > earlier.id)
  );

create unique index if not exists uno_cards_one_use_per_quiz
  on public.uno_cards (session_pin, team_name, card_type);
