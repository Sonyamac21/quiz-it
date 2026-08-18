-- A victory song must be unique per quiz session so two teams can never end
-- up with the same song. The client already pre-checks this before insert,
-- but a check-then-write race lets two teams both pass the check before
-- either row lands. Make the rule authoritative at the database boundary.
--
-- If legacy data already has duplicates, keep the earliest claim per song
-- and clear victory_song on the later duplicate(s) so the constraint can be
-- created; those teams will need to re-pick, which only affects historical
-- rows (not currently affects an active session, since this migration is
-- applied once, ahead of any future joins).
update public.teams later
set victory_song = null
where later.victory_song is not null
  and exists (
    select 1
    from public.teams earlier
    where earlier.session_pin = later.session_pin
      and earlier.victory_song = later.victory_song
      and (
        earlier.created_at < later.created_at
        or (earlier.created_at = later.created_at and earlier.id < later.id)
      )
  );

create unique index if not exists teams_session_song_uidx
  on public.teams (session_pin, victory_song)
  where victory_song is not null;
