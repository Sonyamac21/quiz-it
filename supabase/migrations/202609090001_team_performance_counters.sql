-- Feature: per-team live stats popup on the host console ("tap a team to
-- see their song, correct-answer count, and how many times they were
-- fastest"). Reconstructing this from raw `answers` history is unreliable -
-- the `answers` table has no round reference at all (only `question_index`,
-- which resets to 0 every round), so a past answer row can't be matched
-- back to the right question once more than one round has been played.
--
-- Instead, two real counters are added to `scores` and incremented in the
-- SAME atomic transaction as every point award, so they can never drift out
-- of sync with what actually got scored (Boost doubling, Wipeout Mode,
-- Danger Zone penalties etc. all already funnel through apply_score_delta -
-- this piggybacks on that same call rather than adding a second write).
--
-- correct_count: incremented once per question a team is judged to have
-- answered correctly (multiple_choice/text_answer/number/sequence/
-- picture/audio via the existing isAnswerCorrect() check, and multi_tap for
-- a fully correct set of taps). Deliberately NOT incremented for
-- nearest_wins (no binary right/wrong - it's a ranked estimate) or for
-- manual adjustments/Hard Deck/Pursuit/Spin/Reverse outcomes, which aren't
-- "answered a question correctly" events.
--
-- fastest_count: incremented once per question a team is recorded as this
-- app's existing "fastest correct" determination (scoredFastestTeamRef in
-- app/host/quiz/page.tsx) - for nearest_wins this is instead whoever's
-- guess was closest, reusing the same slot/meaning the celebration screen
-- already gives it.

alter table public.scores
  add column if not exists correct_count integer not null default 0,
  add column if not exists fastest_count integer not null default 0;

-- Replace apply_score_delta with two new trailing optional parameters.
-- Dropped and recreated (rather than a bare CREATE OR REPLACE) because
-- adding parameters changes the function's signature - CREATE OR REPLACE
-- would otherwise silently create a SECOND, overloaded function alongside
-- the old 5-argument one instead of replacing it, which risks an "ambiguous
-- function call" error the next time PostgREST resolves a named-parameter
-- call that could match either overload.
drop function if exists public.apply_score_delta(text, text, integer, integer, text);

create or replace function public.apply_score_delta(
  p_session_pin text,
  p_team_name text,
  p_delta integer,
  p_round_delta integer default null,
  p_event_key text default null,
  p_is_correct boolean default false,
  p_is_fastest boolean default false
) returns table(total_points integer, round_points integer, correct_count integer, fastest_count integer, applied boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_delta integer := coalesce(p_round_delta, p_delta);
  v_correct_inc integer := case when p_is_correct then 1 else 0 end;
  v_fastest_inc integer := case when p_is_fastest then 1 else 0 end;
  v_total integer;
  v_round integer;
  v_correct integer;
  v_fastest integer;
begin
  if p_event_key is not null then
    begin
      insert into public.score_events (event_key, session_pin, team_name)
      values (p_event_key, p_session_pin, p_team_name);
    exception when unique_violation then
      select s.total_points, s.round_points, s.correct_count, s.fastest_count into v_total, v_round, v_correct, v_fastest
      from public.scores s
      where s.session_pin = p_session_pin and s.team_name = p_team_name;
      return query select coalesce(v_total, 0), coalesce(v_round, 0), coalesce(v_correct, 0), coalesce(v_fastest, 0), false;
      return;
    end;
  end if;

  insert into public.scores (session_pin, team_name, total_points, round_points, correct_count, fastest_count, updated_at)
  values (p_session_pin, p_team_name, p_delta, v_round_delta, v_correct_inc, v_fastest_inc, now())
  on conflict (session_pin, team_name)
  do update set
    total_points = scores.total_points + excluded.total_points,
    round_points = scores.round_points + excluded.round_points,
    correct_count = scores.correct_count + excluded.correct_count,
    fastest_count = scores.fastest_count + excluded.fastest_count,
    updated_at = now()
  returning scores.total_points, scores.round_points, scores.correct_count, scores.fastest_count into v_total, v_round, v_correct, v_fastest;

  return query select v_total, v_round, v_correct, v_fastest, true;
end;
$$;

grant execute on function public.apply_score_delta(text, text, integer, integer, text, boolean, boolean) to authenticated;
