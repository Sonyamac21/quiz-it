-- Qualify score columns that collide with the RPC's OUT parameters.
-- Preserve the deployed function's authorisation, rules, grants and other logic.
do $migration$
declare
  definition text;
  old_sql text := E'update public.scores\n  set round_points = round_points + (v_reversed - total_points), total_points = v_reversed, updated_at = now()\n  where session_pin = p_session_pin and team_name = p_team_name\n  returning total_points, round_points into v_total, v_round;';
  new_sql text := E'update public.scores as score\n  set round_points = score.round_points + (v_reversed - score.total_points), total_points = v_reversed, updated_at = now()\n  where score.session_pin = p_session_pin and score.team_name = p_team_name\n  returning score.total_points, score.round_points into v_total, v_round;';
begin
  definition := pg_get_functiondef('public.play_reverse_card(text,text,text,integer,text)'::regprocedure);
  if strpos(definition, new_sql) > 0 then return; end if;
  if strpos(definition, old_sql) = 0 then
    raise exception 'Reverse function differs from reviewed version; no change applied';
  end if;
  execute replace(definition, old_sql, new_sql);
end;
$migration$;
