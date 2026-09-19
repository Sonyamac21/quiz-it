-- Lets a player's handset ask "what round is coming up next?" during the
-- intermission break, so it can show a short rules preview alongside the
-- venue photos already rotating there. session_rounds itself is host-only
-- under RLS (see 202607180002_quiz_builder.sql), so this exposes just the
-- two harmless fields a handset needs (name + round_type) via a narrow
-- SECURITY DEFINER function rather than opening up the whole table.
--
-- Uses sessions.current_session_round_id (not round_number + arithmetic) to
-- find "next" reliably - round_number has had production drift bugs before
-- (see 202607220002_add_sessions_round_number.sql), so anchoring off the
-- session's own pointer to its current round snapshot, then walking to the
-- following position in the SAME session's round list, avoids re-deriving
-- that relationship a second, possibly-inconsistent way.
create or replace function public.next_round_info(p_session_pin text)
returns table(round_name text, round_type text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select sr2.name, sr2.round_type
  from public.sessions s
  join public.session_rounds sr1 on sr1.id = s.current_session_round_id
  join public.session_rounds sr2
    on sr2.session_id = sr1.session_id
   and sr2.position = sr1.position + 1
  where s.pin = p_session_pin
  limit 1;
$$;

revoke all on function public.next_round_info(text) from public;
grant execute on function public.next_round_info(text) to anon, authenticated;
