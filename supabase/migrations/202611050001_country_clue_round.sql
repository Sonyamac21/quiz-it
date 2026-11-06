begin;
set local lock_timeout = '3s';

-- Only the server may stamp the clue band. Existing handset INSERT grants
-- deliberately exclude this new column; the unique answer key keeps one guess.
alter table public.answers add column if not exists country_clue_index integer
  check (country_clue_index between 0 and 4);

create or replace function quiz_private.stamp_country_clue() returns trigger
language plpgsql security definer set search_path=public as $$
declare s public.sessions; idx integer;
begin
  -- Serialize a submission against the host's clue/reveal update. The answer
  -- belongs to whichever clue state wins that database ordering.
  select * into s from public.sessions where pin=new.session_pin for share;
  new.country_clue_index:=null;
  if s.current_question->>'round_type'='where_in_world' then
    if s.status is distinct from 'active' or s.phase is distinct from 'question'
      or new.round_number is distinct from s.round_number
      or new.question_index is distinct from s.current_question_index then
      raise exception 'Country guesses are closed';
    end if;
    if jsonb_typeof(s.current_question->'country_clues') is distinct from 'array'
      or jsonb_array_length(s.current_question->'country_clues')<>5
      or coalesce(s.current_question->>'country_clue_index','') !~ '^[0-4]$' then
      raise exception 'Country clues are not ready';
    end if;
    idx:=(s.current_question->>'country_clue_index')::integer;
    new.country_clue_index:=idx;
  end if;
  return new;
end $$;
revoke all on function quiz_private.stamp_country_clue() from public;
drop trigger if exists stamp_country_clue on public.answers;
create trigger stamp_country_clue before insert on public.answers
  for each row execute function quiz_private.stamp_country_clue();

-- Retain the established allow-list and answer stripping for every other
-- round. Add only the visible country clues, never future clues or aliases.
do $$ begin
  if to_regprocedure('quiz_private.player_payload_without_country(jsonb)') is null then
    alter function quiz_private.player_payload(jsonb) rename to player_payload_without_country;
  end if;
end $$;
create or replace function quiz_private.player_payload(row_data jsonb) returns jsonb
language plpgsql immutable set search_path=public as $$
declare result jsonb; source_q jsonb; q jsonb; clues jsonb; idx integer; revealed boolean;
begin
  result:=quiz_private.player_payload_without_country(row_data);
  source_q:=row_data->'current_question';
  if source_q->>'round_type'='where_in_world' then
    revealed:=coalesce(row_data->>'phase' in ('answer','celebration'),false);
    idx:=case when coalesce(source_q->>'country_clue_index','') ~ '^[0-4]$'
      then (source_q->>'country_clue_index')::integer else 0 end;
    clues:='[]'::jsonb;
    if jsonb_typeof(source_q->'country_clues')='array' then
      select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into clues
      from jsonb_array_elements(source_q->'country_clues') with ordinality as c(value,ord)
      where ord<=case when revealed then 5 else idx+1 end;
    end if;
    q:=(result->'current_question')||jsonb_build_object('country_clue_index',idx,'country_clues',clues);
    if source_q->>'country_flag_src' ~ '^/country-flags/0[1-5]\.svg$'
      and coalesce(source_q->>'country_flag_clue_index','') ~ '^[0-4]$'
      and (revealed or (source_q->>'country_flag_clue_index')::integer<=idx) then
      q:=q||jsonb_build_object('country_flag_src',source_q->'country_flag_src','country_flag_clue_index',source_q->'country_flag_clue_index');
    end if;
    if revealed then q:=q||jsonb_build_object('country_aliases',coalesce(source_q->'country_aliases','[]'::jsonb)); end if;
    result:=result||jsonb_build_object('current_question',q,'allow_power_cards',false);
  end if;
  return result;
end $$;
revoke all on function quiz_private.player_payload(jsonb) from public;

create or replace function public.country_round_ready() returns boolean
language sql stable security definer set search_path=public as $$ select auth.uid() is not null $$;
revoke all on function public.country_round_ready() from public,anon;
grant execute on function public.country_round_ready() to authenticated;

update public.player_sessions p set payload=quiz_private.player_payload(to_jsonb(s))
from public.sessions s where p.id=s.id
  and s.current_question->>'round_type'='where_in_world'
  and p.payload is distinct from quiz_private.player_payload(to_jsonb(s));

commit;
