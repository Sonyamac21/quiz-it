-- Player handsets use Supabase's anon role. Reverse was only granted to
-- authenticated hosts, so the handset could display the card but its RPC was
-- rejected before the function ran. Keep validation inside the security-
-- definer function, then expose only this narrow action to player clients.
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
  v_live_round integer;
  v_cards_allowed boolean;
begin
  select s.round_number, s.allow_power_cards
  into v_live_round, v_cards_allowed
  from public.sessions s
  where s.pin = p_session_pin and s.status <> 'finished';

  if not found then
    return query select 0, 0, false, 'session-not-active';
    return;
  end if;
  if coalesce(v_live_round, p_round_number, 1) <> 1 or p_round_number is distinct from 1 then
    return query select 0, 0, false, 'reverse-only-in-round-1';
    return;
  end if;
  if v_cards_allowed is false then
    return query select 0, 0, false, 'cards-disabled';
    return;
  end if;
  if not exists(select 1 from public.teams t where t.session_pin = p_session_pin and t.team_name = p_team_name) then
    return query select 0, 0, false, 'team-not-found';
    return;
  end if;

  -- A team may play Reverse before the host has initialised the scoreboard.
  -- Ensure zero is still a valid reversible score instead of rejecting the card.
  insert into public.scores(session_pin, team_name, total_points, round_points)
  values(p_session_pin, p_team_name, 0, 0)
  on conflict(session_pin, team_name) do nothing;

  if p_event_key is not null then
    begin
      insert into public.score_events(event_key, session_pin, team_name)
      values(p_event_key, p_session_pin, p_team_name);
    exception when unique_violation then
      select s.total_points, s.round_points into v_total, v_round
      from public.scores s where s.session_pin = p_session_pin and s.team_name = p_team_name;
      return query select coalesce(v_total, 0), coalesce(v_round, 0), false, 'already-applied';
      return;
    end;
  end if;

  begin
    insert into public.uno_cards(team_name, card_type, used, played_at, session_pin, round_number)
    values(p_team_name, 'reverse', true, now(), p_session_pin, 1);
  exception when unique_violation then
    return query select 0, 0, false, 'card-already-used';
    return;
  end;

  select s.total_points into v_current
  from public.scores s
  where s.session_pin = p_session_pin and s.team_name = p_team_name
  for update;

  v_sign := case when v_current < 0 then -1 else 1 end;
  v_reversed := v_sign * coalesce(nullif(reverse(abs(v_current)::text), ''), '0')::integer;
  update public.scores
  set round_points = round_points + (v_reversed - total_points), total_points = v_reversed, updated_at = now()
  where session_pin = p_session_pin and team_name = p_team_name
  returning total_points, round_points into v_total, v_round;

  return query select v_total, v_round, true, 'ok';
end;
$$;

revoke all on function public.play_reverse_card(text, text, integer, text) from public;
grant execute on function public.play_reverse_card(text, text, integer, text) to anon, authenticated;
