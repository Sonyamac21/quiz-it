-- Close the confirmed anonymous library leak immediately without assigning
-- legacy ownership. Authenticated ownership isolation is handled separately
-- by the launch-security migration after the legacy host is confirmed.
begin;
do $$ declare tab text; col record; begin
  foreach tab in array array['questions','question_bank','rounds','media_assets'] loop
    if to_regclass('public.'||tab) is null then continue; end if;
    execute format('revoke all on public.%I from public,anon',tab);
    for col in select column_name from information_schema.columns where table_schema='public' and table_name=tab loop
      execute format('revoke all (%I) on public.%I from public,anon',col.column_name,tab);
    end loop;
    execute format('grant select,insert,update,delete on public.%I to authenticated',tab);
  end loop;
end $$;
revoke all on function public.check_question_memory(text,text,real) from public,anon;
grant execute on function public.check_question_memory(text,text,real) to authenticated;
commit;
select 'Anonymous saved-library access revoked; ownership unchanged' as result;
