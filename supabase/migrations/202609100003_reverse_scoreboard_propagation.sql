-- Publish Reverse's authoritative scores in the same transaction as the card.
-- A publication failure rolls back both the score change and card consumption.
do $migration$
declare
  definition text;
  marker text := 'return query select v_total, v_round, true, ''ok'';';
  publication text := $sql$update public.sessions as session
  set scoreboard_data = (
    select coalesce(jsonb_agg(to_jsonb(board) order by board.total_points desc), '[]'::jsonb)
    from (select team_name, total_points, round_points, correct_count, fastest_count
          from public.scores where session_pin = p_session_pin) as board
  ) where session.pin = p_session_pin;
  if not found then raise exception 'Reverse scoreboard publication found no session'; end if;
  return query select v_total, v_round, true, 'ok';$sql$;
begin
  definition := pg_get_functiondef('public.play_reverse_card(text,text,text,integer,text)'::regprocedure);
  if strpos(definition, 'Reverse scoreboard publication found no session') > 0 then return; end if;
  if strpos(definition, 'returning score.total_points, score.round_points') = 0
     or strpos(definition, marker) = 0 then
    raise exception 'Reverse function differs from reviewed version; no change applied';
  end if;
  -- Qualify fields in the derived board too: the RPC has score OUT parameters.
  publication := replace(publication,
    'select team_name, total_points, round_points, correct_count, fastest_count',
    'select s.team_name, s.total_points, s.round_points, s.correct_count, s.fastest_count');
  publication := replace(publication, 'from public.scores where session_pin', 'from public.scores s where s.session_pin');
  execute replace(definition, marker, publication);
end;
$migration$;
