-- Let every non-selected handset take part in The Hard Deck. Guesses are
-- written atomically and may only be submitted by the handset that registered
-- that team (the same private token used by the Reverse card RPC).
alter table public.sessions
  add column if not exists hard_deck_steal_guesses jsonb not null default '{}'::jsonb,
  add column if not exists hard_deck_steal_winners jsonb not null default '[]'::jsonb,
  add column if not exists hard_deck_play_id text;

create or replace function public.submit_hard_deck_guess(
  p_session_pin text,
  p_team_name text,
  p_player_token text,
  p_guess text
) returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_selected_team text;
begin
  if p_guess not in ('higher', 'lower') then return false; end if;
  if p_player_token is null or not exists(
    select 1 from public.teams t
    where t.session_pin = p_session_pin
      and t.team_name = p_team_name
      and t.player_token_hash = encode(digest(p_player_token, 'sha256'), 'hex')
  ) then return false; end if;

  select hard_deck_team into v_selected_team from public.sessions
  where pin = p_session_pin and status <> 'finished'
    and phase = 'hard_deck' and hard_deck_status = 'awaiting_guess'
  for update;
  if not found then return false; end if;

  if p_team_name = v_selected_team then
    update public.sessions set hard_deck_guess = p_guess
    where pin = p_session_pin and hard_deck_guess is null;
  else
    update public.sessions
    set hard_deck_steal_guesses = jsonb_set(
      coalesce(hard_deck_steal_guesses, '{}'::jsonb),
      array[p_team_name], to_jsonb(p_guess), true
    )
    where pin = p_session_pin
      and not (coalesce(hard_deck_steal_guesses, '{}'::jsonb) ? p_team_name);
  end if;
  return found;
end;
$$;

revoke all on function public.submit_hard_deck_guess(text, text, text, text) from public;
grant execute on function public.submit_hard_deck_guess(text, text, text, text) to anon, authenticated;
