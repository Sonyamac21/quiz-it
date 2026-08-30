-- Codex pre-launch review, finding #1 (score mutations not atomic) and #3
-- (failed score writes reported as successful).
--
-- lib/quiz/scoreService.ts previously did "read current score in the
-- browser, add/compute the new value in JS, then write it back" for every
-- score change. Two changes landing close together (auto-scoring vs a Power
-- Card, a manual adjustment vs Hard Deck/Pursuit/Spin outcomes, the Reverse
-- card) could both read the same starting value and then both write - the
-- second write wins and silently overwrites the first, losing whichever
-- points were applied first. There was no error, no log, nothing for a host
-- to notice.
--
-- These two functions move the read-modify-write into a single atomic
-- database statement each: Postgres's own row lock during an UPDATE means
-- two concurrent calls for the same team can never both read the same
-- starting value - the second one always sees the first one's result.
--
-- The idempotency guard also moves from an in-memory Set in the browser tab
-- (scoreService.ts's `appliedEvents`, which marked an event as "applied"
-- BEFORE confirming the database write actually succeeded, so a failed
-- write with a retry attempt afterward was silently swallowed as a no-op)
-- to a real table with a unique constraint, checked and inserted as part of
-- the same atomic transaction as the score change itself. An event is only
-- ever "applied" once its score change has actually landed in the database.

create table if not exists public.score_events (
  event_key text primary key,
  session_pin text not null,
  team_name text not null,
  applied_at timestamptz not null default now()
);

comment on table public.score_events is 'Durable idempotency ledger for score-changing events (question scoring, manual adjustments, power cards, Hard Deck/Pursuit/Spin outcomes) - an event_key is only recorded here once its paired score change in `scores` has actually committed, in the same transaction.';

alter table public.score_events enable row level security;
drop policy if exists "Hosts manage score events" on public.score_events;
create policy "Hosts manage score events"
  on public.score_events for all
  to authenticated
  using (true)
  with check (true);

-- Atomic point delta (question scoring, manual +/- adjustments, anything
-- expressed as "add N points"). round_delta defaults to the same value as
-- delta, matching the old JS default.
create or replace function public.apply_score_delta(
  p_session_pin text,
  p_team_name text,
  p_delta integer,
  p_round_delta integer default null,
  p_event_key text default null
) returns table(total_points integer, round_points integer, applied boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_delta integer := coalesce(p_round_delta, p_delta);
  v_total integer;
  v_round integer;
begin
  if p_event_key is not null then
    begin
      insert into public.score_events (event_key, session_pin, team_name)
      values (p_event_key, p_session_pin, p_team_name);
    exception when unique_violation then
      select s.total_points, s.round_points into v_total, v_round
      from public.scores s
      where s.session_pin = p_session_pin and s.team_name = p_team_name;
      return query select coalesce(v_total, 0), coalesce(v_round, 0), false;
      return;
    end;
  end if;

  insert into public.scores (session_pin, team_name, total_points, round_points, updated_at)
  values (p_session_pin, p_team_name, p_delta, v_round_delta, now())
  on conflict (session_pin, team_name)
  do update set
    total_points = scores.total_points + excluded.total_points,
    round_points = scores.round_points + excluded.round_points,
    updated_at = now()
  returning scores.total_points, scores.round_points into v_total, v_round;

  return query select v_total, v_round, true;
end;
$$;

-- Atomic absolute set (Spin to Win rank outcomes, the Reverse Power Card).
-- round_points moves by the same amount the total moved by, computed from
-- whatever the CURRENT row value is at the moment of the update (not a
-- value read earlier in JS), which is what makes this race-safe.
create or replace function public.set_score_absolute(
  p_session_pin text,
  p_team_name text,
  p_new_total integer,
  p_event_key text default null
) returns table(total_points integer, round_points integer, applied boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_round integer;
begin
  if p_event_key is not null then
    begin
      insert into public.score_events (event_key, session_pin, team_name)
      values (p_event_key, p_session_pin, p_team_name);
    exception when unique_violation then
      select s.total_points, s.round_points into v_total, v_round
      from public.scores s
      where s.session_pin = p_session_pin and s.team_name = p_team_name;
      return query select coalesce(v_total, 0), coalesce(v_round, 0), false;
      return;
    end;
  end if;

  insert into public.scores (session_pin, team_name, total_points, round_points, updated_at)
  values (p_session_pin, p_team_name, p_new_total, p_new_total, now())
  on conflict (session_pin, team_name)
  do update set
    round_points = scores.round_points + (p_new_total - scores.total_points),
    total_points = p_new_total,
    updated_at = now()
  returning scores.total_points, scores.round_points into v_total, v_round;

  return query select v_total, v_round, true;
end;
$$;

grant execute on function public.apply_score_delta(text, text, integer, integer, text) to authenticated;
grant execute on function public.set_score_absolute(text, text, integer, text) to authenticated;

-- Codex finding #4: the Reverse Power Card previously read the current
-- score in JS, inserted the "card spent" row, then separately called
-- setScoreAbsolute with a value computed from that earlier JS read. Between
-- the read and the final write, another score change could land (or the
-- write itself could fail) - either overwriting that other change, or the
-- card being permanently spent with its effect never actually applied.
-- This folds "consume the card" + "read the CURRENT score" + "reverse its
-- digits" + "write it back" into one atomic database transaction: if the
-- card was already used (unique_violation) or there's no score row to
-- reverse, the whole function raises/returns before anything is written,
-- so the card is never spent for nothing.
create or replace function public.play_reverse_card(
  p_session_pin text,
  p_team_name text,
  p_round_number integer default null,
  p_event_key text default null
) returns table(total_points integer, round_points integer, applied boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
  v_sign integer;
  v_reversed integer;
  v_total integer;
  v_round integer;
begin
  if p_event_key is not null then
    begin
      insert into public.score_events (event_key, session_pin, team_name)
      values (p_event_key, p_session_pin, p_team_name);
    exception when unique_violation then
      select s.total_points, s.round_points into v_total, v_round
      from public.scores s
      where s.session_pin = p_session_pin and s.team_name = p_team_name;
      return query select coalesce(v_total, 0), coalesce(v_round, 0), false, 'already-applied';
      return;
    end;
  end if;

  begin
    insert into public.uno_cards (team_name, card_type, used, played_at, session_pin, round_number)
    values (p_team_name, 'reverse', true, now(), p_session_pin, p_round_number);
  exception when unique_violation then
    return query select 0, 0, false, 'card-already-used';
    return;
  end;

  select s.total_points into v_current
  from public.scores s
  where s.session_pin = p_session_pin and s.team_name = p_team_name
  for update;

  if v_current is null then
    -- No score row to reverse (shouldn't normally happen - teams get a
    -- zero-point row on join). Raising here rolls back the uno_cards insert
    -- above too, so the team keeps the card rather than losing it for
    -- nothing, matching the old JS behaviour's intent.
    raise exception 'no_score_row';
  end if;

  v_sign := case when v_current < 0 then -1 else 1 end;
  v_reversed := v_sign * coalesce(nullif(reverse(abs(v_current)::text), ''), '0')::integer;

  update public.scores
  set round_points = round_points + (v_reversed - total_points),
      total_points = v_reversed,
      updated_at = now()
  where session_pin = p_session_pin and team_name = p_team_name
  returning total_points, round_points into v_total, v_round;

  return query select v_total, v_round, true, 'ok';
exception when others then
  if sqlerrm = 'no_score_row' then
    return query select 0, 0, false, 'no-score-row';
  else
    raise;
  end if;
end;
$$;

grant execute on function public.play_reverse_card(text, text, integer, text) to authenticated;
