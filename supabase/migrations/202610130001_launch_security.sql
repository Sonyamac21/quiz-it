-- Apply before deploying the matching player client. Transactional and fails
-- closed if existing unowned content cannot be assigned to one known host.
begin;

create schema if not exists quiz_private;
revoke all on schema quiz_private from public, anon, authenticated;

-- Replace ALL old policies: permissive policies are OR-ed, so merely adding
-- an owner policy alongside an old open policy would not secure anything.
do $$
declare tab text; pol record; col record; sole_owner uuid;
begin
  if (select count(*) from auth.users) = 1 then select id into sole_owner from auth.users limit 1; end if;
  foreach tab in array array['question_bank','rounds','questions','media_assets','sponsors','victory_songs','venues','quizzes','host_settings','venue_offers'] loop
    if to_regclass('public.' || tab) is null then continue; end if;
    execute format('alter table public.%I add column if not exists owner_id uuid references auth.users(id)', tab);
    if sole_owner is not null then execute format('update public.%I set owner_id = $1 where owner_id is null', tab) using sole_owner; end if;
    execute format('alter table public.%I alter column owner_id set not null, alter column owner_id set default auth.uid()', tab);
    execute format('alter table public.%I enable row level security', tab);
    for pol in select policyname from pg_policies where schemaname='public' and tablename=tab loop
      execute format('drop policy %I on public.%I', pol.policyname, tab);
    end loop;
    execute format('revoke all on public.%I from public, anon', tab);
    for col in select column_name from information_schema.columns where table_schema='public' and table_name=tab loop
      execute format('revoke all (%I) on public.%I from public,anon',col.column_name,tab);
    end loop;
    execute format('grant select, insert, update, delete on public.%I to authenticated', tab);
    execute format('create policy host_owner on public.%I for all to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid())', tab);
    -- Players choose the shared active song catalogue; they never manage it.
    if tab='victory_songs' then
      execute 'grant select on public.victory_songs to anon';
      execute 'create policy active_songs on public.victory_songs for select to anon using (is_active)';
    end if;
    if tab='venue_offers' then
      execute 'grant select on public.venue_offers to anon';
      execute 'create policy active_offers on public.venue_offers for select to anon using (active and (start_date is null or start_date<=current_date) and (end_date is null or end_date>=current_date))';
    end if;
  end loop;
end $$;

alter table public.sessions add column if not exists owner_id uuid references auth.users(id);
update public.sessions s set owner_id=q.owner_id from public.quizzes q where s.quiz_id=q.id and s.owner_id is null;
do $$ begin
  if (select count(*) from auth.users)=1 then
    update public.sessions set owner_id=(select id from auth.users limit 1) where owner_id is null;
  end if;
end $$;
alter table public.sessions alter column owner_id set not null, alter column owner_id set default auth.uid();
alter table public.sessions add column if not exists player_shuffle_seed uuid not null default gen_random_uuid();

-- An answer-free projection with its own realtime publication. Never grant
-- anonymous SELECT on raw sessions: realtime would expose the full row too.
create table public.player_sessions (
  id uuid primary key references public.sessions(id) on delete cascade,
  pin text not null unique,
  status text not null,
  payload jsonb not null
);
alter table public.player_sessions enable row level security;
revoke all on public.player_sessions from public,anon,authenticated;
grant select on public.player_sessions to anon,authenticated;
create policy public_game_state on public.player_sessions for select using (true);
create or replace function quiz_private.strip_answers(value jsonb) returns jsonb
language plpgsql immutable set search_path=public as $$
declare result jsonb; begin
  if jsonb_typeof(value)='object' then
    select coalesce(jsonb_object_agg(key,quiz_private.strip_answers(val)),'{}') into result
    from jsonb_each(value) as items(key,val)
    where key not in ('correct_answer','explanation','questions','answer','correctAnswer');
    return result;
  elsif jsonb_typeof(value)='array' then
    select coalesce(jsonb_agg(quiz_private.strip_answers(val)),'[]') into result from jsonb_array_elements(value) as items(val);
    return result;
  end if;
  return value;
end $$;
create or replace function quiz_private.player_payload(row_data jsonb) returns jsonb
language plpgsql immutable set search_path=public as $$
declare result jsonb; q jsonb; revealed boolean; keys text[]; original_key text; new_key text; mapped text[]; n integer;
begin
  select coalesce(jsonb_object_agg(key,val),'{}') into result from jsonb_each(row_data) as items(key,val)
  where key=any(array['id','pin','status','phase','round_started_at','blocked_teams','scrambled_teams','current_session_round_id','round_number','round_name','current_question_index','timer_started_at','timer_duration','fastest_team','fastest_song','fastest_points','hard_deck_team','hard_deck_status','hard_deck_potential','hard_deck_cards','hard_deck_wheel_target','hard_deck_wheel_spinning','hard_deck_guess','hard_deck_steal_guesses','hard_deck_steal_winners','hard_deck_steal_points','spin_offered','spin_choice','spin_target_idx','spin_nonce','intermission_offers','intermission_whatsapp','intermission_other_quizzes','upcoming_quizzes','venue_record_id','block_until','block_team','show_scoreboard','scoreboard_data','hide_leaderboard','allow_power_cards','quiz_end_revealed_count','quiz_end_trophy_visible','pursuit_status','pairs_status','pairs_content','pairs_progress','pairs_round_id','is_final_round','hot_seat_status','hot_seat_team','hot_seat_locked_teams','hot_seat_answer_started_at','hot_seat_answer_duration','updated_at']);
  result:=result||jsonb_build_object('pursuit_data',quiz_private.strip_answers(row_data->'pursuit_data'));
  q:=row_data->'current_question';
  revealed:=coalesce(row_data->>'phase' in ('answer','celebration'),false) or (row_data->>'phase'='pursuit' and row_data->>'pursuit_status'='reveal');
  if jsonb_typeof(q)='object' then
    -- Use an allow-list so internal verification notes and future metadata
    -- cannot accidentally smuggle answers into the handset response.
    select jsonb_object_agg(key,val) into q from jsonb_each(q) as items(key,val)
    where key=any(array['id','question_text','question_type','option_a','option_b','option_c','option_d','option_e','option_f','correct_answer','explanation','difficulty','round_type','playback_mode','replay_mode','fade_in','fade_out']);
    if q->>'question_type'='sequence' then
      -- The handset submits ordered item text, so shuffle source options on
      -- the server too; client-side shuffling alone leaks their correct order.
      select array_agg(key order by md5(coalesce(row_data->>'player_shuffle_seed','')||coalesce(q->>'question_text','')||key)) into keys
      from unnest(array['a','b','c','d']) as items(key);
      mapped:=array[]::text[];
      foreach original_key in array string_to_array(replace(lower(q->>'correct_answer'),' ',''),',') loop
        n:=array_position(keys,original_key);
        if n is not null then mapped:=array_append(mapped,(array['a','b','c','d'])[n]); end if;
      end loop;
      for n in 1..4 loop
        new_key:=(array['a','b','c','d'])[n];
        result:=result||jsonb_build_object('_sequence_'||new_key,q->('option_'||keys[n]));
      end loop;
      for n in 1..4 loop
        new_key:=(array['a','b','c','d'])[n];
        q:=q||jsonb_build_object('option_'||new_key,result->('_sequence_'||new_key));
        result:=result-('_sequence_'||new_key);
      end loop;
      q:=q||jsonb_build_object('correct_answer',array_to_string(mapped,','));
    end if;
    q:=q||jsonb_build_object('answer_input_type',case when q->>'question_type' in ('number','nearest_wins') or q->>'correct_answer' ~ '^\d+$' then 'number' else 'text' end);
    if q->>'question_type' in ('audio','picture') then q:=q||jsonb_build_object('option_a',null); end if;
    if not revealed then q:=quiz_private.strip_answers(q)||jsonb_build_object('correct_answer',''); end if;
  end if;
  return result||jsonb_build_object('current_question',q);
end $$;
create or replace function quiz_private.publish_player_session() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  insert into public.player_sessions(id,pin,status,payload) values(new.id,new.pin,new.status,quiz_private.player_payload(to_jsonb(new)))
  on conflict(id) do update set pin=excluded.pin,status=excluded.status,payload=excluded.payload;
  return new;
end $$;
create trigger publish_safe_player_session after insert or update on public.sessions for each row execute function quiz_private.publish_player_session();
insert into public.player_sessions(id,pin,status,payload) select id,pin,status,quiz_private.player_payload(to_jsonb(s)) from public.sessions s;
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime' and not puballtables) then
    alter publication supabase_realtime add table public.player_sessions;
  end if;
end $$;

create or replace function quiz_private.owns_session(p_pin text) returns boolean
language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and exists(select 1 from public.sessions where pin=p_pin and owner_id=auth.uid());
$$;
create or replace function quiz_private.is_handset(p_pin text,p_team text) returns boolean
language sql stable security definer set search_path=public,extensions as $$
  select exists(select 1 from public.teams where session_pin=p_pin and team_name=p_team
    and player_token_hash=encode(digest(nullif(current_setting('request.headers',true),'')::jsonb->>'x-quiz-player-token','sha256'),'hex'));
$$;
-- Policies need USAGE but this schema is not exposed through PostgREST.
grant usage on schema quiz_private to anon, authenticated;
grant execute on function quiz_private.owns_session(text), quiz_private.is_handset(text,text) to anon, authenticated;

do $$ declare tab text; pol record; col record; begin
  foreach tab in array array['sessions','teams','answers','scores','score_events','uno_cards','session_photos','game_history'] loop
    if to_regclass('public.'||tab) is null then continue; end if;
    execute format('alter table public.%I enable row level security',tab);
    for pol in select policyname from pg_policies where schemaname='public' and tablename=tab loop
      execute format('drop policy %I on public.%I',pol.policyname,tab);
    end loop;
    execute format('revoke all on public.%I from public,anon',tab);
    for col in select column_name from information_schema.columns where table_schema='public' and table_name=tab loop
      execute format('revoke all (%I) on public.%I from public,anon',col.column_name,tab);
    end loop;
    execute format('grant select,insert,update,delete on public.%I to authenticated',tab);
    if tab='sessions' then
      execute 'create policy host_session on public.sessions for all to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid() and (quiz_id is null or exists(select 1 from public.quizzes q where q.id=quiz_id and q.owner_id=auth.uid())))';
    else
      execute format('create policy host_session on public.%I for all to authenticated using (quiz_private.owns_session(session_pin)) with check (quiz_private.owns_session(session_pin))',tab);
    end if;
  end loop;
end $$;

-- Protect snapshots and calendar rows even if an old dashboard policy was
-- accidentally left open. The harmless round rule remains handset-readable.
do $$ declare tab text; pol record; col record; condition text; begin
  foreach tab in array array['session_rounds','quiz_rounds','events'] loop
    if to_regclass('public.'||tab) is null then continue; end if;
    for pol in select policyname from pg_policies where schemaname='public' and tablename=tab loop execute format('drop policy %I on public.%I',pol.policyname,tab); end loop;
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from public,anon',tab);
    for col in select column_name from information_schema.columns where table_schema='public' and table_name=tab loop execute format('revoke all (%I) on public.%I from public,anon',col.column_name,tab); end loop;
    execute format('grant select,insert,update,delete on public.%I to authenticated',tab);
    condition:=case tab when 'events' then 'host_id=auth.uid()'
      when 'session_rounds' then 'exists(select 1 from public.sessions s where s.id=session_id and s.owner_id=auth.uid())'
      else 'exists(select 1 from public.quizzes q where q.id=quiz_id and q.owner_id=auth.uid())' end;
    execute format('create policy host_owner on public.%I for all to authenticated using (%s) with check (%s)',tab,condition,condition);
  end loop;
  if to_regclass('public.session_photos') is not null then
    grant insert(session_id,session_pin,team_name,photo_url) on public.session_photos to anon;
    create policy handset_photo_submit on public.session_photos for insert to anon with check (
      quiz_private.is_handset(session_pin,team_name) and exists(select 1 from public.player_sessions s where s.id=session_id and s.pin=session_pin)
    );
  end if;
end $$;

-- Never expose the private handset hash, even to other anonymous teams.
-- No anonymous privileges on raw teams, including column grants that could
-- inadvertently admit the whole secret-bearing row through realtime.
create view public.player_teams with (security_barrier=true) as
  select id,session_pin,team_name,victory_song,photo_approved,created_at,last_seen_at from public.teams;
revoke all on public.player_teams from public,anon,authenticated;
grant select on public.player_teams to anon,authenticated;
create or replace function public.join_player_team(p_session_pin text,p_team_name text,p_victory_song text,p_photo_url text,p_player_token text)
returns void language plpgsql security definer set search_path=public,extensions as $$ begin
  if nullif(trim(p_team_name),'') is null or length(p_team_name)>100 or length(coalesce(p_player_token,''))<32
    or not exists(select 1 from public.sessions where pin=p_session_pin and status in ('waiting','active')) then
    raise exception 'A live PIN, team name and private handset token are required';
  end if;
  insert into public.teams(session_pin,team_name,name,victory_song,photo_url,player_token_hash)
    values(p_session_pin,trim(p_team_name),trim(p_team_name),p_victory_song,p_photo_url,encode(digest(p_player_token,'sha256'),'hex'));
end $$;
revoke all on function public.join_player_team(text,text,text,text,text) from public;
grant execute on function public.join_player_team(text,text,text,text,text) to anon,authenticated;
create or replace function public.player_heartbeat(p_session_pin text,p_team_name text)
returns void language plpgsql security definer set search_path=public as $$ begin
  if not quiz_private.is_handset(p_session_pin,p_team_name) then raise exception 'Use the original handset' using errcode='42501'; end if;
  update public.teams set last_seen_at=clock_timestamp() where session_pin=p_session_pin and team_name=p_team_name;
end $$;
revoke all on function public.player_heartbeat(text,text) from public;
grant execute on function public.player_heartbeat(text,text) to anon,authenticated;

create or replace function public.get_player_round_rule(p_round_id uuid)
returns table(danger_zone_enabled boolean) language sql stable security definer set search_path=public as $$
  select danger_zone_enabled from public.session_rounds where id=p_round_id;
$$;
revoke all on function public.get_player_round_rule(uuid) from public;
grant execute on function public.get_player_round_rule(uuid) to anon,authenticated;

create or replace function public.get_player_team_photo(p_session_pin text,p_team_name text)
returns table(photo_url text,photo_approved boolean) language sql stable security definer set search_path=public as $$
  select case when t.photo_approved then t.photo_url else null end,t.photo_approved
  from public.teams t where t.session_pin=p_session_pin and t.team_name=p_team_name and quiz_private.is_handset(p_session_pin,p_team_name);
$$;
revoke all on function public.get_player_team_photo(text,text) from public;
grant execute on function public.get_player_team_photo(text,text) to anon,authenticated;

grant select on public.answers to anon;
grant insert(session_pin,team_name,round_number,question_index,answer_text) on public.answers to anon;
create policy handset_answers_read on public.answers for select to anon using (quiz_private.is_handset(session_pin,team_name));
create policy handset_answers_insert on public.answers for insert to anon with check (quiz_private.is_handset(session_pin,team_name));
create or replace function quiz_private.check_answer_window() returns trigger
language plpgsql security definer set search_path=public as $$
declare s public.sessions%rowtype; deadline timestamptz;
begin
  if quiz_private.owns_session(new.session_pin) then return new; end if;
  select * into s from public.sessions where pin=new.session_pin;
  if not found or s.status <> 'active' or s.phase not in ('question','timer','hot_seat','pursuit')
    or new.round_number is distinct from s.round_number or new.question_index is distinct from s.current_question_index
    or nullif(trim(new.answer_text),'') is null
    or (s.phase='pursuit' and s.pursuit_status <> 'question')
    or (s.phase='hot_seat' and (s.hot_seat_team is distinct from new.team_name or s.hot_seat_status <> 'claimed'))
  then raise exception 'This question is not accepting answers' using errcode='42501'; end if;
  deadline := case when s.phase='hot_seat' then s.hot_seat_answer_started_at+make_interval(secs=>coalesce(s.hot_seat_answer_duration,15))
    else s.timer_started_at+make_interval(secs=>s.timer_duration) end;
  if deadline is not null and clock_timestamp()>deadline+interval '1.5 seconds' then
    raise exception 'The answer deadline has passed' using errcode='42501';
  end if;
  return new;
end $$;
create trigger secure_answer_window before insert on public.answers for each row execute function quiz_private.check_answer_window();

grant select on public.scores, public.uno_cards to anon;
create policy public_scoreboard on public.scores for select to anon using (true);
create policy public_card_inventory on public.uno_cards for select to anon using (true);

-- One host/handset must not poison another session/team's idempotency key.
do $$ declare constraint_name text; begin
  for constraint_name in
    select c.conname from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    where c.conrelid='public.score_events'::regclass and c.contype in ('p','u') and array_length(c.conkey,1)=1 and a.attname='event_key'
  loop execute format('alter table public.score_events drop constraint %I',constraint_name); end loop;
  alter table public.score_events add primary key(session_pin,team_name,event_key);
end $$;

-- Harden existing score RPCs without changing their atomic/idempotent bodies.
do $$ declare signature text; definition text; begin
  for signature in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('apply_score_delta','set_score_absolute') loop
    definition:=pg_get_functiondef(signature::regprocedure);
    if strpos(definition,'quiz_private.owns_session(p_session_pin)')=0 then
      if strpos(definition,E'begin\n')=0 then raise exception 'Unexpected score RPC definition: %',signature; end if;
      definition:=replace(definition,E'begin\n',E'begin\n  if not quiz_private.owns_session(p_session_pin) then raise exception ''Only the session owner can change scores'' using errcode=''42501''; end if;\n');
      execute definition;
    end if;
    execute 'revoke all on function '||signature||' from public, anon';
    execute 'grant execute on function '||signature||' to authenticated';
  end loop;
  -- Retire the old Reverse overload lacking a private handset token.
  if to_regprocedure('public.play_reverse_card(text,text,integer,text)') is not null then
    revoke all on function public.play_reverse_card(text,text,integer,text) from public,anon,authenticated;
  end if;
end $$;

-- Hot Seat's legacy RPC already uses the team name. Require the private
-- handset header before allowing that name to claim the seat.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.claim_hot_seat(text,text)'::regprocedure);
  if strpos(definition,'quiz_private.is_handset(p_session_pin,p_team_name)')=0 then
    if strpos(definition,E'begin\n')=0 then raise exception 'Unexpected Hot Seat RPC definition'; end if;
    execute replace(definition,E'begin\n',E'begin\n  if not quiz_private.is_handset(p_session_pin,p_team_name) then raise exception ''Use the original handset'' using errcode=''42501''; end if;\n');
  end if;
end $$;
revoke all on function public.check_question_memory(text,text,real) from public,anon;
alter function public.check_question_memory(text,text,real) security invoker;
alter function public.check_question_memory(text,text,real) set search_path=public,extensions;
grant execute on function public.check_question_memory(text,text,real) to authenticated;

create or replace function public.player_session_choice(p_session_pin text,p_team_name text,p_player_token text,p_choice text)
returns void language plpgsql security definer set search_path=public,extensions as $$
declare s public.sessions%rowtype;
begin
  if not exists(select 1 from public.teams where session_pin=p_session_pin and team_name=p_team_name and player_token_hash=encode(digest(p_player_token,'sha256'),'hex')) then
    raise exception 'Use the handset that joined this team' using errcode='42501';
  end if;
  select * into s from public.sessions where pin=p_session_pin and status='active' for update;
  if not found then raise exception 'Session is not active'; end if;
  if p_choice in ('spin','pass') and s.spin_offered and s.spin_choice is null and s.fastest_team=p_team_name and s.phase in ('spin_to_win','celebration') then
    update public.sessions set spin_choice=p_choice where id=s.id;
  elsif p_choice='stick' and s.phase='hard_deck' and s.hard_deck_status='decision' and s.hard_deck_team=p_team_name then
    update public.sessions set hard_deck_status='won' where id=s.id;
  elsif p_choice='gamble' and s.phase='hard_deck' and s.hard_deck_status='decision' and s.hard_deck_team=p_team_name then
    update public.sessions set hard_deck_status='awaiting_guess',hard_deck_steal_guesses='{}',hard_deck_steal_winners='[]' where id=s.id;
  else raise exception 'That choice is not available to this team' using errcode='42501'; end if;
end $$;
revoke all on function public.player_session_choice(text,text,text,text) from public;
grant execute on function public.player_session_choice(text,text,text,text) to anon,authenticated;

create or replace function public.consume_player_card(p_session_pin text,p_team_name text,p_player_token text,p_card_type text,p_round_number integer)
returns void language plpgsql security definer set search_path=public,extensions as $$
declare s public.sessions%rowtype;
begin
  if not exists(select 1 from public.teams where session_pin=p_session_pin and team_name=p_team_name and player_token_hash=encode(digest(p_player_token,'sha256'),'hex')) then
    raise exception 'Use the handset that joined this team' using errcode='42501';
  end if;
  select * into s from public.sessions where pin=p_session_pin and status='active' for update;
  if not found or not coalesce(s.allow_power_cards,false) or s.phase in ('pairs','pursuit','hot_seat','quiz_end','waiting','round_start') or p_round_number is distinct from s.round_number or p_card_type not in ('x2','block') then
    raise exception 'That Power Card is not available';
  end if;
  if p_card_type='block' then
    if s.block_pending or s.block_until>clock_timestamp() then raise exception 'Another Time-Out is waiting or active'; end if;
    update public.sessions set block_pending=true,block_team=p_team_name,block_until=null where id=s.id;
  end if;
  insert into public.uno_cards(team_name,card_type,used,played_at,session_pin,round_number) values(p_team_name,p_card_type,true,clock_timestamp(),p_session_pin,p_round_number);
end $$;
revoke all on function public.consume_player_card(text,text,text,text,integer) from public;
grant execute on function public.consume_player_card(text,text,text,text,integer) to anon,authenticated;

commit;
