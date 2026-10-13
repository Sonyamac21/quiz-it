-- Run once immediately before the launch-security migration. The live project
-- has no managed backups, so retain a private, same-project recovery snapshot.
-- No auth credentials are copied and no source rows are changed or deleted.
begin;
create schema quiz_launch_backup_20261013;
revoke all on schema quiz_launch_backup_20261013 from public,anon,authenticated;
create table quiz_launch_backup_20261013.policies as select * from pg_policies where schemaname='public';
create table quiz_launch_backup_20261013.table_grants as select * from information_schema.table_privileges where table_schema='public';
create table quiz_launch_backup_20261013.column_grants as select * from information_schema.column_privileges where table_schema='public';
create table quiz_launch_backup_20261013.columns as select * from information_schema.columns where table_schema='public';
create table quiz_launch_backup_20261013.table_security as select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';
create table quiz_launch_backup_20261013.constraints as select c.conrelid::regclass::text as table_name,c.conname,pg_get_constraintdef(c.oid) as definition from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public';
create table quiz_launch_backup_20261013.functions as select p.oid::regprocedure::text as signature,pg_get_functiondef(p.oid) as definition,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.proname in ('apply_score_delta','set_score_absolute','play_reverse_card','claim_hot_seat','check_question_memory','submit_pairs_attempt','submit_hard_deck_guess');
do $$ declare tab text; begin
  foreach tab in array array['question_bank','rounds','questions','media_assets','sponsors','victory_songs','venues','quizzes','host_settings','venue_offers','sessions','teams','answers','scores','score_events','uno_cards','session_photos','game_history','session_rounds','quiz_rounds','events'] loop
    if to_regclass('public.'||tab) is not null then execute format('create table quiz_launch_backup_20261013.%I as table public.%I',tab,tab); end if;
  end loop;
end $$;
do $$ declare tab record; begin
  for tab in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='quiz_launch_backup_20261013' and c.relkind='r' loop
    execute format('alter table quiz_launch_backup_20261013.%I enable row level security',tab.relname);
  end loop;
end $$;
revoke all on all tables in schema quiz_launch_backup_20261013 from public,anon,authenticated;
commit;
select 'Private recovery snapshot created; source data unchanged' as result;
