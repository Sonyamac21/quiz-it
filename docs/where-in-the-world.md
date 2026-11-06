# Where in the World?

Add this round from **Quiz Plans → Add a round → Where in the World?**.
Use **Add country packs · free** to fill five country questions, or **Write
country clues** to supply your own. Each country has five editable clues,
hardest first. Some packs include a flag with clue four. The editor can move
the flag to another clue or remove it.

During play, **Send Question Live** opens clue one. Each press of **Next clue**
(or Space) reveals one additional clue. After clue five, the next action reveals
the country and scores the answers. The host controls the pace; there is no
automatic countdown. Teams can submit one guess per country. A wrong guess
earns zero and cannot be replaced.

| Clues revealed at submission | Points for a correct country |
| --- | --- |
| 1 | 10 |
| 2 | 8 |
| 3 | 6 |
| 4 | 4 |
| 5 | 2 |

The maximum round score is 50. Power Cards, speed bonuses and Danger Zone
penalties do not apply. Accepted alternative country names are editable;
country matching does not use fuzzy matching that might confuse Iran/Iraq
or Austria/Australia.

The initial release contains 20 prepared country packs. Adding them makes no
AI requests. Generation excludes countries in the host's saved country rounds;
it never silently reuses an exhausted pack. After the unused packs are exhausted,
write additional countries and clues manually. Save/reuse whole rounds through
the Round Library so their clues and flags remain together.

## Database deployment

Apply `supabase/migrations/202611050001_country_clue_round.sql` before hosting
this round. Session creation and round start check for the update and block
the new round if it is missing. Existing round types continue to work.

The migration adds a server-written clue index to answers, retains the existing
one-answer unique key and handset token policies, and projects only currently
visible clues to phones. Flag metadata is withheld until its clue is visible;
answers and accepted aliases remain private until the answer reveal. A session
row lock orders submissions against host clue/reveal changes, so a later clue
cannot change the points band of an already saved guess.

Validation covers every score band, explicit aliases, pack exhaustion and
repeat prevention, structural readiness, the rendered clue/flag component,
zero AI requests, and PostgreSQL permissions, clue projection, first-guess
immutability and server stamping. Run `npm test`, `npx tsc --noEmit`, and
`npm run build -- --webpack` before release.
