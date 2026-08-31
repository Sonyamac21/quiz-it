-- The Reverse power card is only supposed to be playable in Round 1 (Sonya's
-- house rule). components/UnoCards.tsx already blocks the button and re-checks
-- roundNumber before calling this RPC, but that's a client-side check only -
-- the play_reverse_card() function itself accepted any p_round_number with no
-- validation, so a stale handset (or anything bypassing the UI) could still
-- reverse a score in round 2+. This adds the same rule as the actual source of
-- truth, matching the "don't trust the client" fix already applied to uploads/
-- photo moderation (Codex #5/#6).
create or replace function public.play_reverse_card(
  p_session_pin text,
  p_team_name text,
  p_round_number integer default null,
  p_event_key text default null
) returns table(total_points integer, round_points integer, applied boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
  v_sign integer;
  v_reversed integer;
  v_total integer;
  v_round integer;
begin
  if p_round_number is distinct from 1 then
    return query select 0, 0, false, 'reverse-only-in-round-1';
    return;
  end if;

  if p_event_key is not null then
    begin
      insert into public.score_events (event_key, session_pin, team_name)
      values (p_event_key, p_session_pin, p_team_name);
    exception when unique_violation then
      select s.total_points, s.round_points into v_total, v_round
      from public.scores s
      where s.session_pin = p_session_pin and s.team_name = p_team_name;
      return query select coalesce(v_total, 0), coalesce(v_round, 0), false, 'already-applied';
      return;
    end;
  end if;

  begin
    insert into public.uno_cards (team_name, card_type, used, played_at, session_pin, round_number)
    values (p_team_name, 'reverse', true, now(), p_session_pin, p_round_number);
  exception when unique_violation then
    return query select 0, 0, false, 'card-already-used';
    return;
  end;

  select s.total_points into v_current
  from public.scores s
  where s.session_pin = p_session_pin and s.team_name = p_team_name
  for update;

  if v_current is null then
    -- No score row to reverse (shouldn't normally happen - teams get a
    -- zero-point row on join). Raising here rolls back the uno_cards insert
    -- above too, so the team keeps the card rather than losing it for
    -- nothing, matching the old JS behaviour's intent.
    raise exception 'no_score_row';
  end if;

  v_sign := case when v_current < 0 then -1 else 1 end;
  v_reversed := v_sign * coalesce(nullif(reverse(abs(v_current)::text), ''), '0')::integer;

  update public.scores
  set round_points = round_points + (v_reversed - total_points),
      total_points = v_reversed,
      updated_at = now()
  where session_pin = p_session_pin and team_name = p_team_name
  returning total_points, round_points into v_total, v_round;

  return query select v_total, v_round, true, 'ok';
exception when others then
  if sqlerrm = 'no_score_row' then
    return query select 0, 0, false, 'no-score-row';
  else
    raise;
  end if;
end;
$$;
