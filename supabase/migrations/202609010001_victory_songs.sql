-- Victory Songs manager. Previously the whole "pick your victory song" list
-- on the join screen was a hardcoded array in app/join/join-form.tsx, with
-- several garbled legacy-SpeedQuizzing filenames as the display titles
-- (e.g. "CC American GIrls SQS", "D Bedd Gotta Get Through This SQS") and no
-- way for the host to fix a title or add a new track without a code change.
--
-- file_ref is either:
--   - a bundled filename matching an mp3 already in public/sounds/ (kept
--     EXACTLY matching the old hardcoded array values, so any team that has
--     already picked one this season keeps working with no data migration)
--   - a full https:// URL for a track the host uploads later via the new
--     Victory Songs admin page (stored in Vercel Blob)
--
-- sort_order controls display order on the join screen; is_active lets a
-- host retire a track without deleting history that referenced it.
create table if not exists public.victory_songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  file_ref text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.victory_songs enable row level security;

-- Every player on the join screen (anonymous, no auth) needs to read the
-- active song list - mirrors how teams/questions are already readable
-- without auth elsewhere in this schema.
create policy "victory_songs_select_all" on public.victory_songs
  for select using (true);

-- Only a logged-in host can manage the list.
create policy "victory_songs_write_authenticated" on public.victory_songs
  for insert to authenticated with check (true);
create policy "victory_songs_update_authenticated" on public.victory_songs
  for update to authenticated using (true) with check (true);
create policy "victory_songs_delete_authenticated" on public.victory_songs
  for delete to authenticated using (true);

insert into public.victory_songs (sort_order, title, file_ref, is_active) values
(0, 'Believe - Cher', 'BELIEVE-Cher-', true),
(1, 'Breakeven - The Script', 'BREAKEVEN-The Script SQS', true),
(2, 'Where''s Your Head At - Basement Jaxx', 'Basement Jax Where''s your head at SQS', true),
(3, 'Be My Lover - La Bouche', 'Be my Lover-La Bouche SQS', true),
(4, 'Boom Boom Boom - Outhere Brothers', 'Boom Boom Boom-Outhere Brothers SQS', true),
(5, 'Freestyler - Bomfunk MC''s', 'Boomfunk Freestyler SQS', true),
(6, 'American Girls - Counting Crows', 'CC American GIrls SQS', true),
(7, 'Coco Jambo - Mr. President', 'COCO JAMBO-MR PRESIDENT-', true),
(8, 'U Got 2 Let the Music - Cappella', 'Capella U Got 2 Let The Music SQS', true),
(9, 'I Like It - Cardi B', 'Cardi B I Like it Like That SQS', true),
(10, 'Castles in the Sky - Ian Van Dahl', 'Castles In The Sky - Ian Van Dahl SQS', true),
(11, 'Hey Boy Hey Girl - The Chemical Brothers', 'Chemical Bros Hey Boy Hey Girl SQS', true),
(12, 'Come On Eileen - Dexys Midnight Runners', 'Come On Eileen-Dexys Midnight Runners-', true),
(13, 'Gotta Get Thru This - Daniel Bedingfield', 'D Bedd Gotta Get Through This SQS', true),
(14, 'Danger Zone - Kenny Loggins', 'DANGER ZONE-KENNY LOGGINS-', true),
(15, 'Disturbia - Rihanna', 'DISTURBIA-Rihanna-', true),
(16, 'Bootylicious - Destiny''s Child', 'Destiny''s Child Bootylicious SQS', true),
(17, 'Massive - Drake', 'Drake - Massive SQS', true),
(18, 'Fancy - Drake', 'Drake Fancy SQS', true),
(19, 'Be the One - Dua Lipa', 'Dua Be the One SQS', true),
(20, 'Shivers - Ed Sheeran', 'Ed Sheeran - Shivers SQS', true),
(21, 'Cold Heart - Elton John & Dua Lipa', 'Elton John & Dua Lipa - Cold Heart SQS', true),
(22, 'Who''s That Girl - Eve', 'Eve Who that girl SQS', true),
(23, 'Blame It on Me - George Ezra', 'Ezra Blame it on me SQS', true),
(24, 'The Final Countdown - Europe', 'FINAL COUNTDOWN-EUROPE-', true),
(25, 'Gettin'' Jiggy Wit It - Will Smith', 'GETTIN JIGGY WIT IT-Will Smith-', true),
(26, 'Ghetto Superstar - Mya & Wyclef Jean', 'GHETTO SUPERSTAR-MYA, Wyclef Jean-', true),
(27, 'Freed From Desire - Gala', 'Gala Freed from Desire SQS', true),
(28, 'Get Ur Freak On - Missy Elliott', 'Get Ur Freak On-MISSY ELLIOTT-', true),
(29, 'Girlfriend - Avril Lavigne', 'Girlfriend-AVRIL LAVIGNE SQS', true),
(30, 'Just One Last Time - David Guetta', 'Guetta Just one last time SQS', true),
(31, 'Hey Baby - DJ Otzi', 'Hey Baby-DJ Otzi-', true),
(32, 'I Don''t Feel Like Dancin'' - Scissor Sisters', 'I Dont Feel Like Dancin-Scissor Sisters SQS', true),
(33, 'I Want You Back - ''N Sync', 'I Want You Back-NSync-', true),
(34, '(I''ve Had) The Time of My Life - Bill Medley & Jennifer Warnes', 'IVE HAD THE TIME OF MY LIFE-BILL MEDLEY, JENNIFER WARNES-', true),
(35, 'Thunder - Imagine Dragons', 'Imagine Dragons Thunder SQS', true),
(36, 'Jai Ho - Pussycat Dolls', 'JAI HO-PUSSYCAT DOLLS-', true),
(37, 'Just Dance - Lady Gaga', 'Just Dance-Lady Gaga SQS', true),
(38, 'Higher Love - Kygo & Whitney Houston', 'KYGO & Whitney Higher Love', true),
(39, 'Karma Chameleon - Culture Club', 'Karma Chameleon-CULTURE CLUB-', true),
(40, 'King of My Castle - Wamdue Project', 'King of my Castle-Wamdue Project SQS', true),
(41, 'Lovin'' Each Day - Ronan Keating', 'LOVIN EACH DAY-Ronan Keating-', true),
(42, 'Good as Hell - Lizzo', 'Lizzo Good as Hell', true),
(43, 'Mambo No. 5 - Lou Bega', 'MAMBO NO 5-LOU BEGA-', true),
(44, 'Man! I Feel Like a Woman - Shania Twain', 'MAN I FEEL LIKE A WOMAN-Shania Twain-', true),
(45, 'Maria Maria - Santana ft. The Product G&B', 'MARIA MARIA-SANTANA, THE PRODUCT GB-', true),
(46, 'U Can''t Touch This - MC Hammer', 'MC Hammer Cant touch this SQS', true),
(47, 'MMMBop - Hanson', 'MMMBOP-HANSON-', true),
(48, 'Cheerleader - OMI', 'OMI Cheerleader', true),
(49, 'Boom Boom Boom - Outhere Brothers', 'Outhere Bros Boom Boom Boom SQS', true),
(50, 'Trouble - P!nk', 'Pink Trouble SQS', true),
(51, 'Played-A-Live (The Bongo Song) - Safri Duo', 'Played Alive-Safri-Duo SQS', true),
(52, 'Pretty Green Eyes - Ultrabeat', 'Pretty Green Eyes', true),
(53, 'Raise Your Glass - P!nk', 'Raise your glass-Pink SQS', true),
(54, 'Touch Me - Rui Da Silva ft. Cassandra', 'Rui Da Silva Touch me SQS', true),
(55, 'Set You Free - N-Trance', 'SET YOU FREE-N-Trance-', true),
(56, 'Don''t You Worry Child - Swedish House Mafia', 'SHM Don''t you worry child SQS', true),
(57, 'Ecuador - Sash!', 'Sash Equador SQS', true),
(58, 'Whenever, Wherever - Shakira', 'Shakira Whenever, Wherever SQS', true),
(59, 'It Takes Two - Tina Turner & Rod Stewart', 'Tina Turner It Takes Two SQS', true)
on conflict do nothing;
