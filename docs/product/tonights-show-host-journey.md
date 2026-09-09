# "Tonight's Show" — Host Journey Specification

Owner: Claude (product spec). Consumed by: Codex (implements the guided workflow in
Sprint 3 of the delivery plan). This is a screen-by-screen specification of the
complete host journey, end to end — not code, not visual design. It defines what
exists at each stage today (grounded in the actual routes under `app/host/`), what's
missing, and the exact sequence a "Tonight's Show" guided workflow should present.

Existing Back Office routes referenced throughout: `app/host/venues`,
`app/host/events`, `app/host/quizzes` (Quiz Plan builder), `app/host/question-bank`
(Question Library), `app/host/rounds` (Round Library), `app/host/music-prep`,
`app/host/session` (pre-show/lobby), `app/host/quiz` (live Mission Control console),
`app/host/display` (TV/projector), `app/host/reports`, `app/host/settings`,
`app/host/hosts`, `app/host/victory-songs`, `app/host/sponsors`.

---

## 0. Design principle

Today, all of the above routes sit as equal-weight siblings in Back Office
navigation — a host has to know which of ten sections to visit, in which order, to
get from "I have a venue booked tonight" to "I'm live on stage." The Tonight's Show
workflow does not replace any of these routes; it sequences them. Every step below
links out to the existing screen that already does the job, in a fixed left-to-right
or top-to-bottom order, with a persistent progress indicator ("Step 3 of 8") so a
host always knows where they are and what's left.

Everything not part of tonight's specific run — Hosts, Sponsors, Victory Songs
library management, historical Reports browsing, Settings — moves to a secondary
"Manage" area (per the platform review's Quick Win), reachable from the same nav but
visually de-emphasised relative to the Tonight's Show entry point.

---

## Step 1 — Preparing a venue

**Existing screen:** `app/host/venues`

**Job to be done:** confirm the venue record for tonight has what a live show needs:
logo, host photo/identity, schedule text, prize info, victue offers/ads, TV aspect
ratio expectations.

**Tonight's Show entry:** "Which venue is tonight?" — a searchable picker (existing
venues) plus "+ New Venue" inline, not a separate flow to abandon and return to.

**Gate to proceed:** venue record must have at minimum a name and one branding asset
(logo or host photo) before the workflow lets the host continue — a completely blank
venue reaching the display screen live is the single most visible "this looks
unfinished" moment the platform review flagged. If nothing is set, block with:
"Add at least a venue name and logo before continuing" rather than silently
proceeding to a blank-branded show.

---

## Step 2 — Building a quiz

**Existing screen:** `app/host/quizzes` (Quiz Plan builder)

**Job to be done:** assemble the night's rounds — either from scratch, from the Round
Library, or via Generate-All-Rounds.

**Tonight's Show entry:** if tonight's venue already has a quiz plan in progress
(saved but not yet run), resume it directly. If not, land on Quiz Plan with the venue
pre-selected (removing the "which venue is this quiz for" question a host currently
has to answer manually).

**Gate to proceed:** at least one round with at least one question. Reuses the
existing `QUESTION_ROUND_TYPES` pre-flight check already built into
`lib/quiz/planStatus.ts` — Tonight's Show surfaces that check's result at this step
rather than only at the point of going live, so a gap is caught with time to fix it,
not right before doors open.

---

## Step 3 — Generating and reviewing rounds

**Existing screens:** `app/host/quizzes` (Generate All / per-round generation),
`app/host/question-bank` (Question Library, for manual review/swap)

**Job to be done:** fill any round that's empty or under-strength, then review
generated content before it's locked in.

**Tonight's Show entry:** this step only appears if Step 2 leaves any round without a
full question count — if the plan is already complete (built entirely from the
Library or Round Library), skip straight to Step 4. Don't force a review step on a
host who already curated everything by hand.

**Review sub-screen:** every AI-generated question added this session gets a single
consolidated review list (not scattered across per-round panels) with Approve /
Swap / Regenerate actions inline — this is the natural surface for the AI
question-governance badges (verification status, duplicate warning, date-sensitive
flag) specified in `question-quality-and-acceptance.md`.

**Gate to proceed:** no round may proceed to Step 4 with a question still flagged
Needs Review or Draft (per the four-state model in
`question-library-information-architecture.md`) — everything going out on stage
tonight must be Approved.

---

## Step 4 — Preparing music and images

**Existing screen:** `app/host/music-prep`

**Job to be done:** confirm every Music round question has a locatable, licensed
track, and every Picture round question has a durably-hosted (not hotlinked) image.

**Tonight's Show entry:** auto-populated with tonight's plan's music/picture
questions — a host should never have to separately remember "did I check music prep
for this specific quiz."

**Gate to proceed:** zero unresolved tracks/images. This step exists specifically
because it's been a repeat real bug source this session (broken Pixabay hotlinks,
missing tracks) — Tonight's Show should not let a host discover a broken image live
on the TV screen when it could have been caught here.

---

## Step 5 — Pre-show health check

**Existing screen:** none today — this is new, and is the "pre-show certification
screen" both platform reviews called for.

**Job to be done:** one pass/fail checklist immediately before opening the lobby.

**Checklist items** (each pass/fail, not just informational):
- Display connected and showing the correct aspect ratio.
- Audio unlocked and test-played (one tap, one confirmed sound).
- All Music/Picture assets resolved (rolls up Step 4's result — don't re-derive).
- No round has zero questions (rolls up Step 2/3's gates).
- No question in tonight's plan is still Draft/Needs Review (rolls up Step 3).
- Realtime/Supabase connectivity confirmed live (a simple round-trip ping, not just
  "page loaded").
- Host device and any secondary devices (TV browser, iPad) are on the same session.

**Gate to proceed:** "Start Lobby" is disabled until every item passes, OR the host
explicitly overrides a specific failed item with a visible acknowledgement (e.g. "I
know the audio didn't test — continue anyway") — never a silent bypass. Overrides
should be logged (even just to console/diagnostics) so a post-mortem on a bad night
can see what was knowingly skipped.

---

## Step 6 — Opening the lobby

**Existing screens:** `app/host/session` (host-side), `app/host/display` (TV lobby/
waiting screen)

**Job to be done:** get the QR/PIN on the TV, let teams join, watch the count build.

**Tonight's Show entry:** this step is just "go live" — the workflow's job here is
handing off cleanly to the existing lobby screen, not replacing it.

**Enhancement referenced from the platform review** (build separately, not blocking
this spec): a live-updating join count next to the QR code on the display screen.

**Gate to proceed:** none — a host should be able to sit in the lobby as long as they
like waiting for teams. This step has no "must complete" condition, just a clear
"Start Quiz" action when they're ready.

---

## Step 7 — Operating every round

**Existing screen:** `app/host/quiz` (Mission Control, live console)

**Job to be done:** everything covered elsewhere this session already — sending
questions, scoring, Power Cards, round-leader visibility, tap-team stats, block/
scramble tools, Hard Deck/Pursuit/Hot Seat mechanics.

**Tonight's Show's only responsibility at this step:** the entry hand-off (arriving
at Mission Control with the right session/round context already loaded, no manual
re-selection) and, per the platform review, the plain-language recovery-message
library from `terminology-and-host-copy.md` §3 wired through every failure path in
this screen. No new screen structure needed here — Mission Control already is "the"
screen for this step.

---

## Step 8 — Handling errors during play

Not a separate screen — a cross-cutting requirement that applies throughout Step 7.
Every failure mode gets the specific host-facing message from
`terminology-and-host-copy.md` §3 (score-write failure, audio failure, stale
handsets, disconnect/reconnect, display acknowledgement timeout) rather than a raw
console error or a generic toast. This is Codex's implementation responsibility;
Claude's responsibility (already delivered) is the exact copy for each case.

---

## Step 9 — Presenting winners

**Existing screens:** `app/host/quiz` (celebration/results flow), `app/host/display`
(winner reveal on TV)

**Job to be done:** the emotional peak of the night — podium reveal, victory song,
photos.

**Tonight's Show's role:** none beyond ensuring the hand-off from Step 7 into the
existing winner-reveal flow is automatic (no manual "now go to the results screen"
step for the host to remember). Enhancement content (count-up podium, shareable
winner card) is covered separately in the platform review's Phase 3 recommendations,
not part of this workflow spec.

---

## Step 10 — Closing and reporting the event

**Existing screen:** `app/host/reports`

**Job to be done:** confirm the session is marked complete, scores are finalised, and
the night is captured for later reference.

**Tonight's Show entry:** on ending the quiz, automatically land the host on that
night's report (not the general Reports list) with a one-line summary — "Quiz
complete. [N] teams, winner: [team]." — and a clear way back to the general Reports
area (`app/host/reports`) for anything else. This closes the loop the workflow
opened at Step 1, rather than leaving the host to find their own way back to Back
Office navigation once the live show is over.

**Note:** deeper Reports functionality (venue trends, exportable results, per-team
history) is the "bigger strategic bets" material from the platform review — out of
scope for this workflow spec, which only covers the hand-off into whatever Reports
becomes.

---

## Summary: what Codex needs to build vs. what already exists

**New:** the Tonight's Show entry point/progress-stepper itself (a thin orchestration
layer linking existing screens in sequence with gates between them), the Step 5
pre-show health check screen (genuinely new), the Step 1 venue-completeness gate, the
Step 3 consolidated AI-review list, the Step 10 auto-landing report summary.

**Existing, just sequenced/gated differently:** Steps 1, 2, 4, 6, 7, 9 are all
existing screens — this spec does not ask Codex to rebuild any of them, only to add
entry/exit gating and pre-population (e.g. venue/quiz context carried step to step
rather than re-selected).

**Not part of this spec:** the "Manage" secondary-nav reorganisation (Hosts,
Sponsors, Victory Songs, Settings, general Reports) is a navigation-structure change
that can happen independently of the Tonight's Show flow itself, and isn't blocked by
it — it can be built in either order.
