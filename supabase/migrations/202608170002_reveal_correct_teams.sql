-- Teams have a "victory song" (public.teams.victory_song) and the audio
-- infra to play it (lib/audio/showAudio.ts) already exists, but it was only
-- ever wired to the SINGLE "fastest correct" team during the celebration/
-- spin flow. Every other team that also got the question right heard
-- nothing. This column lets the host record, at reveal time, the full list
-- of teams that answered correctly for the question just revealed, so the
-- Display can play each of their theme songs (not just the fastest team's).
alter table public.sessions
  add column if not exists reveal_correct_teams text[];

comment on column public.sessions.reveal_correct_teams is
  'Team names that answered the just-revealed question correctly, set by the host on Reveal. Used by the Display to play each of those teams'' victory songs in turn, not just the single fastest-correct team used for the celebration/spin flow.';
