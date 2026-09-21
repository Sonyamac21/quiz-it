-- Preserve the first server-recorded completion time across reconnects.
-- Keep canonical team names for score rows and the existing atomic award key.
create or replace function public.submit_pairs_attempt(
  p_session_pin text,
  p_team_name text,
  p_player_token text,
  p_first_tile_id text,
  p_second_tile_id text
) returns table(correct boolean, newly_solved boolean, solved_count integer, mistakes integer, reason text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.sessions%rowtype;
  v_first_pair text;
  v_second_pair text;
  v_team_key text;
  v_team_progress jsonb;
  v_solved jsonb;
  v_mistakes integer;
  v_event_key text;
  v_canonical_team text;
begin
  select * into v_session from public.sessions
  where pin = p_session_pin and status <> 'finished'
  for update;
  if not found or v_session.phase <> 'pairs' or v_session.pairs_status <> 'live' then
    return query select false, false, 0, 0, 'round-not-live'; return;
  end if;
  if p_first_tile_id is null or (p_second_tile_id is not null and p_first_tile_id = p_second_tile_id) then
    return query select false, false, 0, 0, 'invalid-selection'; return;
  end if;
  if p_player_token is null or not exists(
    select 1 from public.teams t where t.session_pin = p_session_pin
      and lower(trim(t.team_name)) = lower(trim(p_team_name))
      and t.player_token_hash = encode(digest(p_player_token, 'sha256'), 'hex')
  ) then
    return query select false, false, 0, 0, 'handset-not-authorised'; return;
  end if;

  select pair->>'pair_id' into v_first_pair
  from jsonb_array_elements(v_session.pairs_content) pair
  where p_first_tile_id in (pair->>'pair_id' || '-a', pair->>'pair_id' || '-b') limit 1;
  if p_second_tile_id is not null then
    select pair->>'pair_id' into v_second_pair
    from jsonb_array_elements(v_session.pairs_content) pair
    where p_second_tile_id in (pair->>'pair_id' || '-a', pair->>'pair_id' || '-b') limit 1;
  end if;
  if v_first_pair is null or (p_second_tile_id is not null and v_second_pair is null) then
    return query select false, false, 0, 0, 'unknown-tile'; return;
  end if;

  select t.team_name into v_canonical_team from public.teams t
  where t.session_pin = p_session_pin and lower(trim(t.team_name)) = lower(trim(p_team_name))
  and t.player_token_hash = encode(digest(p_player_token, 'sha256'), 'hex') limit 1;

  select team_key into v_team_key
  from jsonb_object_keys(v_session.pairs_progress) as keys(team_key)
  where lower(trim(team_key)) = lower(trim(p_team_name)) limit 1;
  v_team_key := coalesce(v_team_key, v_canonical_team);
  v_team_progress := coalesce(v_session.pairs_progress->v_team_key, '{"solved_pair_ids":[],"mistakes":0}'::jsonb);
  v_solved := coalesce(v_team_progress->'solved_pair_ids', '[]'::jsonb);
  v_mistakes := coalesce((v_team_progress->>'mistakes')::integer, 0);

  -- The first tile is durable too: refreshing/reconnecting mid-selection
  -- restores it instead of silently changing the team's intended attempt.
  if p_second_tile_id is null then
    v_team_progress := v_team_progress || jsonb_build_object('solved_pair_ids', v_solved, 'mistakes', v_mistakes, 'selected_tile_id', p_first_tile_id);
    update public.sessions set pairs_progress = jsonb_set(pairs_progress, array[v_team_key], v_team_progress, true), updated_at = now()
    where id = v_session.id;
    return query select false, false, jsonb_array_length(v_solved), v_mistakes, 'selected'; return;
  end if;

  if v_first_pair <> v_second_pair then
    v_mistakes := v_mistakes + 1;
    v_team_progress := v_team_progress || jsonb_build_object('solved_pair_ids', v_solved, 'mistakes', v_mistakes, 'selected_tile_id', null);
    update public.sessions set pairs_progress = jsonb_set(pairs_progress, array[v_team_key], v_team_progress, true), updated_at = now()
    where id = v_session.id;
    return query select false, false, jsonb_array_length(v_solved), v_mistakes, 'wrong-pair'; return;
  end if;

  if v_solved @> jsonb_build_array(v_first_pair) then
    return query select true, false, jsonb_array_length(v_solved), v_mistakes, 'already-solved'; return;
  end if;
  v_solved := v_solved || jsonb_build_array(v_first_pair);
  if jsonb_array_length(v_solved) = 3 and v_team_progress->>'completed_at' is null then
    v_team_progress := v_team_progress || jsonb_build_object('completed_at', clock_timestamp());
  end if;
  v_team_progress := v_team_progress || jsonb_build_object('solved_pair_ids', v_solved, 'mistakes', v_mistakes, 'selected_tile_id', null);
  update public.sessions set pairs_progress = jsonb_set(pairs_progress, array[v_team_key], v_team_progress, true), updated_at = now()
  where id = v_session.id;

  v_event_key := 'pairs:' || v_session.id::text || ':' || coalesce(v_session.pairs_round_id, 'round') || ':' || lower(trim(p_team_name)) || ':' || v_first_pair;
  begin
    insert into public.score_events(event_key, session_pin, team_name) values(v_event_key, p_session_pin, v_canonical_team);
    insert into public.scores(session_pin, team_name, total_points, round_points, correct_count, fastest_count, updated_at)
    values(p_session_pin, v_canonical_team, 1, 1, 0, 0, now())
    on conflict(session_pin, team_name) do update set
      total_points = scores.total_points + 1,
      round_points = scores.round_points + 1,
      updated_at = now();
  exception when unique_violation then
    -- Progress and award use the same durable key. A reconnect/retry can
    -- never earn the point twice.
    null;
  end;

  update public.sessions set scoreboard_data = coalesce((
    select jsonb_agg(jsonb_build_object(
      'team_name', ranked.team_name, 'total_points', ranked.total_points,
      'round_points', ranked.round_points, 'correct_count', ranked.correct_count,
      'fastest_count', ranked.fastest_count
    ) order by ranked.total_points desc, ranked.team_name)
    from public.scores ranked where ranked.session_pin = p_session_pin
  ), '[]'::jsonb), updated_at = now() where id = v_session.id;

  return query select true, true, jsonb_array_length(v_solved), v_mistakes, 'ok';
end;
$$;

revoke all on function public.submit_pairs_attempt(text,text,text,text,text) from public;
grant execute on function public.submit_pairs_attempt(text,text,text,text,text) to anon, authenticated;
