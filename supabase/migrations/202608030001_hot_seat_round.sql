-- Hot Seat live round state.
-- The session row is authoritative so host, display, and handsets recover the
-- same claimant and lockout list after refresh or a temporary disconnect.

alter table public.sessions
  add column if not exists hot_seat_status text not null default 'idle',
  add column if not exists hot_seat_team text,
  add column if not exists hot_seat_locked_teams jsonb not null default '[]'::jsonb,
  add column if not exists hot_seat_answer_started_at timestamptz,
  add column if not exists hot_seat_answer_duration integer not null default 15;

alter table public.sessions
  drop constraint if exists sessions_hot_seat_status_check,
  add constraint sessions_hot_seat_status_check
    check (hot_seat_status in ('idle', 'open', 'claimed', 'submitted')),
  drop constraint if exists sessions_hot_seat_answer_duration_check,
  add constraint sessions_hot_seat_answer_duration_check
    check (hot_seat_answer_duration between 10 and 15),
  drop constraint if exists sessions_hot_seat_locked_teams_check,
  add constraint sessions_hot_seat_locked_teams_check
    check (jsonb_typeof(hot_seat_locked_teams) = 'array');

comment on column public.sessions.hot_seat_status is
  'Live Hot Seat state: idle, open for buzzes, claimed, or answer submitted.';
comment on column public.sessions.hot_seat_team is
  'Team that currently owns the Hot Seat for this question.';
comment on column public.sessions.hot_seat_locked_teams is
  'Teams that have already attempted the current Hot Seat question.';
comment on column public.sessions.hot_seat_answer_started_at is
  'Database time at which the current team won the buzz.';
comment on column public.sessions.hot_seat_answer_duration is
  'Seconds available to answer after winning the Hot Seat.';

create or replace function public.claim_hot_seat(
  p_session_pin text,
  p_team_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed_session public.sessions%rowtype;
begin
  if not exists (
    select 1
    from public.teams
    where session_pin = p_session_pin
      and team_name = p_team_name
  ) then
    return jsonb_build_object('claimed', false, 'reason', 'team_not_found');
  end if;

  update public.sessions
  set hot_seat_status = 'claimed',
      hot_seat_team = p_team_name,
      hot_seat_answer_started_at = now()
  where pin = p_session_pin
    and phase = 'hot_seat'
    and hot_seat_status = 'open'
    and hot_seat_team is null
    and not (hot_seat_locked_teams ? p_team_name)
  returning * into claimed_session;

  if found then
    return jsonb_build_object(
      'claimed', true,
      'team', p_team_name,
      'answer_started_at', claimed_session.hot_seat_answer_started_at,
      'answer_duration', claimed_session.hot_seat_answer_duration
    );
  end if;

  return jsonb_build_object('claimed', false, 'reason', 'buzz_closed');
end;
$$;

revoke all on function public.claim_hot_seat(text, text) from public;
grant execute on function public.claim_hot_seat(text, text) to anon, authenticated;
