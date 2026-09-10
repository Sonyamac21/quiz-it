-- Run against the isolated rehearsal session 6069. All fixture writes roll back.
begin;
set local statement_timeout = '15s';
insert into public.teams(team_name,name,session_pin,player_token_hash)
values ('TestReverse6069','TestReverse6069','6069',encode(extensions.digest('test-only','sha256'),'hex'));
insert into public.scores(session_pin,team_name,total_points,round_points)
values ('6069','TestReverse6069',19,19);
do $test$
declare r record; points integer; cards integer;
begin
  select * into r from public.play_reverse_card('6069','TestReverse6069','test-only',1,'test-reverse6069');
  if r.applied is distinct from true or r.total_points <> 91 or r.round_points <> 91 then raise exception '19 to 91 failed: %', row_to_json(r); end if;
  select * into r from public.play_reverse_card('6069','TestReverse6069','test-only',1,'test-reverse6069');
  if r.applied or r.reason <> 'already-applied' then raise exception 'Event retry failed: %', row_to_json(r); end if;
  select * into r from public.play_reverse_card('6069','TestReverse6069','test-only',1,'test-reverse6069-again');
  if r.applied or r.reason <> 'card-already-used' then raise exception 'Duplicate card failed: %', row_to_json(r); end if;
  select * into r from public.play_reverse_card('6069','TestReverse6069','wrong-token',1,'test-reverse6069-unauthorised');
  if r.applied or r.reason <> 'handset-not-authorised' then raise exception 'Token check failed: %', row_to_json(r); end if;
  select total_points into points from public.scores where session_pin='6069' and team_name='TestReverse6069';
  select count(*) into cards from public.uno_cards where session_pin='6069' and team_name='TestReverse6069' and card_type='reverse';
  if points <> 91 or cards <> 1 then raise exception 'Final score/card count failed'; end if;
  if not exists (
    select 1 from public.sessions s, jsonb_array_elements(s.scoreboard_data::jsonb) b
    where s.pin='6069' and b->>'team_name'='TestReverse6069' and (b->>'total_points')::integer=91
  ) then raise exception 'Reverse scoreboard propagation failed'; end if;
end;
$test$;
select 'PASS: 19 to 91, event retry, duplicate card, token check, exactly one card' as result;
rollback;
