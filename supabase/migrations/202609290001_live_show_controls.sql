-- Shared display mix and an atomic sound-check reset. Teams keep their handset
-- tokens and PIN; the saved quiz and its session snapshots are retained.
alter table public.sessions add column if not exists audio_mix jsonb not null default '{}';

create or replace function public.restart_quiz_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.sessions%rowtype;
  first_round public.session_rounds%rowtype;
begin
  select * into s from public.sessions where id = p_session_id for update;
  if not found or auth.uid() is null or not exists (
    select 1 from public.quizzes q where q.id = s.quiz_id
      and (q.owner_id = auth.uid() or q.host_id = auth.uid())
  ) then raise exception 'Only this quiz owner or assigned host can restart it'; end if;
  if s.status = 'finished' then raise exception 'A closed session cannot be restarted'; end if;
  select * into first_round from public.session_rounds where session_id = s.id order by position limit 1;
  if not found then raise exception 'No saved rounds to restart'; end if;

  delete from public.answers where session_pin = s.pin;
  delete from public.uno_cards where session_pin = s.pin;
  delete from public.score_events where session_pin = s.pin;
  update public.scores set total_points = 0, round_points = 0, correct_count = 0, fastest_count = 0, updated_at = now() where session_pin = s.pin;
  update public.session_rounds set completed_at = null where session_id = s.id;
  update public.sessions set
    status = 'active', phase = 'round_start', current_session_round_id = first_round.id,
    round_id = first_round.source_round_id, round_name = first_round.name, round_number = 1,
    round_started_at = clock_timestamp(), current_question_index = 0, current_question = null,
    timer_started_at = null, timer_duration = null,
    fastest_team = null, fastest_song = null, fastest_points = null,
    show_scoreboard = false, show_scoreboard_on_display = false, hide_leaderboard = first_round.hide_leaderboard,
    allow_power_cards = first_round.allow_power_cards,
    is_final_round = (select count(*) = 1 from public.session_rounds where session_id = s.id),
    blocked_teams = '[]', scrambled_teams = '[]', block_pending = false, block_team = null, block_until = null,
    hot_seat_status = 'idle', hot_seat_team = null, hot_seat_locked_teams = '[]', hot_seat_answer_started_at = null,
    pursuit_status = 'idle', pursuit_data = '{}',
    pairs_status = 'idle', pairs_content = '[]', pairs_progress = '{}', pairs_round_id = null,
    hard_deck_status = 'idle', hard_deck_team = null, hard_deck_cards = '[]', hard_deck_guess = null,
    hard_deck_potential = 0, hard_deck_has_swapped = false, hard_deck_wheel_target = null, hard_deck_wheel_spinning = false,
    hard_deck_steal_guesses = '{}', hard_deck_steal_winners = '[]', hard_deck_steal_points = 0, hard_deck_play_id = null,
    spin_offered = false, spin_choice = null, spin_nonce = null, spin_target_idx = null,
    quiz_end_revealed_count = 0, quiz_end_trophy_visible = false,
    scoreboard_data = coalesce((select jsonb_agg(jsonb_build_object('team_name', team_name, 'total_points', 0, 'round_points', 0, 'correct_count', 0, 'fastest_count', 0)) from public.scores where session_pin = s.pin), '[]'::jsonb),
    updated_at = clock_timestamp()
  where id = s.id;
end;
$$;
revoke all on function public.restart_quiz_session(uuid) from public;
grant execute on function public.restart_quiz_session(uuid) to authenticated;
