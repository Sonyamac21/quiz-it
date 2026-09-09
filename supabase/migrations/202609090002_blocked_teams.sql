-- Feature: host-only "block a team from this question" manual tool (item c
-- of the bundled host-console request - the other two, keyboard-scramble and
-- a 5-second delay, are separate follow-up asks). The host taps a team in
-- the live console to stop them submitting an answer to the CURRENT question
-- only; it auto-clears every time a new question goes out
-- (app/host/quiz/page.tsx doSendQuestion/doPreviewQuestion already reset it
-- to '[]' in the same update as fastest_team/fastest_song etc).
--
-- Stored as a plain jsonb array of team_name strings on `sessions` (the same
-- row PlayerQuizScreen.tsx already subscribes to via postgres_changes for
-- current_question/phase/etc), so the player handset picks this up through
-- its existing realtime subscription with no new channel needed.

alter table public.sessions
  add column if not exists blocked_teams jsonb not null default '[]'::jsonb;
