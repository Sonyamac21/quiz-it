# Reliability Acceptance Checklist — Multi-Venue Use (Sonya)

Owner: Claude (product spec). Purpose: a concrete, testable bar for "Quiz-It is
solid enough for me to rely on across multiple venues" — separate from and prior to
`commercial-launch-positioning-and-readiness.md`, which covers a different, later
question (selling accounts to other hosts). This checklist is about YOUR own
reliability, running YOUR own shows, at however many venues you personally book.

**How to use this:** run through it across your next few real quiz nights, at more
than one venue, not just one clean test session at home. Tick each item only once
you've seen it hold up live, not just read that it should work. Anything that fails
gets logged in §6 with enough detail that Codex (once unpaused on this track) can
reproduce and fix it, rather than "it went wrong once, not sure why."

---

## 1. Scoring correctness (per round type, live)

Check each round type you actually run, not just the ones easiest to test:

- [ ] **Regular** (Multiple Choice / Text / Number / Sequence): correct answers
      score, incorrect don't, speed bonus goes to the right team.
- [ ] **Multi Tap**: partial credit lands as expected — a team that gets most but
      not all options right sees a sensible partial score, not zero and not full
      marks. (Per the corrected scoring model — 2 points per correctly-judged
      option.)
- [ ] **Nearest Wins**: closest guess wins full points, 2nd/3rd get their tapered
      share, everyone else gets zero. A genuine tie (two teams equally close) goes
      to whoever answered first.
- [ ] **Hot Seat**: buzz-in works, wrong answer or timeout correctly reopens to the
      next team, correct answer ends the question and awards points.
- [ ] **Hard Deck**: the point ladder (10/20/40/60/100) awards correctly, Stick vs.
      Gamble behaves as expected.
- [ ] **Pursuit**: no team is incorrectly eliminated, the 100-point bonus goes to
      the actual highest scorer (or is shared on a genuine tie).
- [ ] **Danger Zone / Boost / Reverse / Time-Out** (whichever Power Cards you have
      active): each does exactly what it's supposed to and nothing more — Boost
      doubles, Reverse flips an opponent's score, Time-Out blocks everyone but the
      played team.

## 2. Network resilience

- [ ] Deliberately background or briefly disconnect one handset mid-question (turn
      on airplane mode for a few seconds, then off). On reconnect: the team's
      already-submitted answer is preserved, not lost, not duplicated, not
      overwritten by a stale resubmission.
- [ ] A team's answer submitted right as venue wifi blips does not silently fail —
      either it goes through, or the player sees a clear "didn't go through, retry"
      state, never silence.
- [ ] The host console itself survives a refresh mid-round: round, question index,
      and scores are restored correctly, not reset to zero or to the wrong round.
- [ ] If the host's device loses connection entirely for a few seconds mid-show,
      reconnecting doesn't create a second, conflicting session state.

## 3. Audio

- [ ] Every Music round track starts on time, at the moment the host advances to
      it — no delay, no silence where music should be.
- [ ] No overlapping audio — a countdown/klaxon/victory song never plays on top of
      another cue.
- [ ] Test this at more than one venue's actual speaker/TV setup, not just your own
      home setup — different venues' audio routing (TV speakers vs. a PA system vs.
      a Bluetooth speaker) is exactly the kind of thing that works in one place and
      silently fails in another.
- [ ] If audio does fail to start, the host sees a visible retry control (not just
      silence they have to notice themselves).

## 4. Cross-venue / cross-session isolation (for your own multiple bookings, not
   multi-tenant/other-hosts — that's the separate commercial readiness question)

- [ ] Running a quiz at Venue A on Monday and Venue B on Wednesday: Wednesday's
      session starts with a clean scoreboard, no leftover teams or scores from
      Monday.
- [ ] Two different sessions (e.g. an early and late show at the same venue in one
      night) don't cross-contaminate each other's answers or scores.
- [ ] Venue-specific branding (logo, host photo, offers) shows the correct venue's
      assets every time, never a stale/previous venue's branding carried over.

## 5. Recovery and error visibility

- [ ] If a score write fails (simulate by testing on a deliberately poor
      connection, if you can), you as host SEE that it failed, with a clear message
      and retry option — not a silently wrong scoreboard.
- [ ] Ending a quiz early or restarting mid-show doesn't leave the display or
      player handsets stuck on a stale screen.
- [ ] A team that never got a score row initialised (edge case: joined very late)
      doesn't break the leaderboard for everyone else.

## 6. Issue log

Use this table to record anything that fails during real-venue testing — enough
detail for Codex to reproduce, not just "it broke":

| Date | Venue | Round type / feature | What happened | What you expected | Reproducible? |
|---|---|---|---|---|---|
| | | | | | |

---

## 7. When to consider this "passed"

Not a one-night pass/fail — run this across at least 2-3 real shows at more than one
venue before calling it solid, since venue-to-venue variance (wifi quality, audio
setup, team count) is exactly what a single clean test session won't surface. Once
every box above is ticked across multiple real nights with nothing logged in §6 (or
everything logged has been fixed and re-verified), that's the point where "reliable
for my own multi-venue use" is a fact, not a feeling — and the right moment to
revisit unpausing Codex on the commercial multi-host track.
