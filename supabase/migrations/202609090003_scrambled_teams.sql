-- Feature: host-only "scramble a team's keyboard" manual tool (item d of the
-- bundled host-console request). Same shape and lifecycle as blocked_teams
-- (202609090002_blocked_teams.sql): a plain jsonb array of team_name
-- strings on `sessions`, host-toggled per team, question-scoped, cleared
-- every time a new question goes out. Player handset consumes it via the
-- same existing realtime subscription and feeds it into AnswerKeypad's
-- `scrambled` prop, which shuffles the on-screen QWERTY layout once per
-- question mount rather than gating submission outright.

alter table public.sessions
  add column if not exists scrambled_teams jsonb not null default '[]'::jsonb;
