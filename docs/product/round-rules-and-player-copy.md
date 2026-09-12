# Round Rules, Power Cards & Player-Facing Copy

Owner: Claude (content/product spec). This extends
`terminology-and-host-copy.md` (host-facing operational copy) with the
player/display-facing narrative copy that document didn't cover: round rules
sign-off, Power Card explanations, reconnection wording, and final-results
copy. Follows the same terminology and voice rules already established there.

---

## 1. Round rules — sign-off on existing copy

Reviewed the live rules text in `buildRules()` (`app/host/quiz/page.tsx`) against the
three-part house style specified in `terminology-and-host-copy.md` §6 (goal, how
points are earned, special mechanic). Pursuit, Hot Seat, Multi Tap, Nearest Wins and
Hard Deck all already meet that structure and read well — **no changes needed**,
this is a formal sign-off rather than a rewrite. Specifically confirmed good:
- Pursuit: clearly states the no-elimination mechanic and the tie-handling for the
  bonus, which matters because it's the one place a team might otherwise assume a
  wrong answer knocks them out.
- Hot Seat: the buzz-lockout-reopen mechanic is explained in the right order (buzz →
  answer window → wrong locks out → reopens) so a first-time player can follow it
  live without having seen it before.
- Multi Tap: already explicitly states "leaving a wrong option untapped scores
  exactly the same as tapping a correct one" — this is the single most
  counter-intuitive part of the mechanic and it's called out directly rather than
  left implicit. Keep this exact framing when any Multi Tap copy is touched for
  other reasons.

One small addition, not a correction: Hard Deck's rules list should state the
point ladder explicitly (10/20/40/60/100) rather than "score points and keep going,"
since knowing the actual stakes is part of what makes the Stick/Gamble choice
meaningful to a player watching. Suggested line to add: *"Cards are worth
10, 20, 40, 60, then 100 points — the further you go, the more you're gambling."*

---

## 2. Power Card explanations

Existing internal labels (`cardLabel` in `app/host/quiz/page.tsx`): Time-Out
("block"), Reverse, Boost ("x2"). Player-facing explanation copy, for wherever cards
are introduced/available (currently minimal — this is largely new copy):

**Boost**
- One-line: "Double your points on this question — if you're confident, spend it
  here."
- Risk framing: "If you get it wrong, there's nothing to lose beyond the normal
  question — Boost only multiplies a positive score, never a penalty."
  *(Codex to confirm this risk framing is actually true of the current
  implementation — Boost doubling is applied to the full delta including
  Danger Zone penalties per some scoring branches; if a negative delta also gets
  doubled under Boost, this copy is wrong and should instead say "Boost doubles
  whatever you score this question — including a penalty, if Danger Zone is
  active," which is a materially different risk statement a team deserves to see
  before spending the card.)*

**Reverse**
- One-line: "Reverse another team's score for this round — used at the right
  moment, this can flip a runaway leader."
- Player-facing framing should make clear this targets an opponent, not the team's
  own score — current internal naming ("Reverse Power Card") doesn't make the
  target obvious from the name alone. Suggested on-card copy: "Reverse [Team]'s
  score."

**Time-Out**
- One-line: "Freeze every other team out of this question for a few seconds — you
  get a head start."
- Already has decent existing framing on the receiving end ("[Team] played
  Time-Out," with a visible countdown) — keep that, it's clear and doesn't need
  rewriting.

**General Power Card framing (once per session, on first availability):** "Power
Cards are one-time tools you can play during the game — use them when they'll make
the biggest difference, not just as soon as you get one."

---

## 3. Reconnection guidance (player-facing)

Current copy (`components/PlayerQuizScreen.tsx`): "Connection lost. Close and reopen
the keypad to reconnect." with a RECONNECT button that reloads the page.

This is functional but doesn't tell a player what happens to an answer they'd
already locked in before losing connection — a real source of anxiety mid-quiz
("did my answer count?"). Proposed replacement copy:

- Title: "CONNECTION LOST" (keep, it's clear)
- Body, if the team had already submitted an answer for the current question before
  disconnecting: **"Your answer is already in — reconnect to keep playing."**
- Body, if the team had NOT yet submitted: **"Reconnect to answer this question
  before time runs out."**
- Button: "RECONNECT" (keep)

This requires the reconnect screen to know whether a submission already went
through for the current question before disconnecting — Codex to confirm whether
that state is available client-side at the point this screen renders, or whether it
needs to check on reconnect and then show one of the two messages retroactively
(acceptable either way; the point is a player should never be left wondering).

---

## 4. Final results / winner screen wording

Player handset and TV display, at the close of the quiz:

- Overall structure (podium-style, third → second → first, per the platform
  review's recommended count-up reveal): each placement gets its own short beat
  before advancing, not a single static list.
- Per-placement copy: **"[N]RD PLACE" / "RUNNER-UP" / "TONIGHT'S WINNERS"** — not
  "1st/2nd/3rd" as raw ordinals, which reads flatter on a big screen than the named
  variants.
- Winning team's line: **"[Team name] — [score] points"** followed by their chosen
  victory song title, if set — reuses the existing victory-song feature as part of
  the reveal moment rather than only as background audio.
- Margin-of-victory line, when the gap is close (within ~10% of the runner-up's
  score): **"Just [N] points ahead of [runner-up team]"** — a close finish is more
  dramatically interesting than a landslide and should be called out; skip this line
  entirely for a wide margin rather than stating an unremarkable gap.
- Every other team's screen (non-podium): **"You finished [Nth] with [score]
  points."** — every team should get a personal result, not just silence while the
  podium is shown to the room.
- Closing line, all screens: **"Thanks for playing tonight's quiz at [venue name]."**
  — always names the venue, reinforcing the "this is [venue]'s show" positioning
  from the commercial pitch, not a generic Quiz-It sign-off.

---

## 5. Cross-reference

Button labels, error messages, confirmation dialogs, and empty states for the *host*
console remain in `terminology-and-host-copy.md` — this document only adds the
player/display-facing narrative copy that doc didn't cover. Keep both in sync if
terminology changes (e.g. if "Handset" vs. "Your phone" is resolved per the open
item in `question-quality-and-acceptance.md` §14a, update the wording in §3 and §4
above accordingly, since both use "you"/"your" phrasing rather than "Handset"
directly, so no change may be needed there regardless of that decision).
