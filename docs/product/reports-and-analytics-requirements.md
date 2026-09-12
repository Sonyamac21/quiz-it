# Reports & Analytics — Requirements Specification

Owner: Claude (product spec). Consumed by: Codex (data model/calculations/
implementation, per the ownership agreement's "Reports" shared-review row —
Claude specifies the useful business questions, Codex owns the data model and
interface). This document specifies what Reports (`app/host/reports`) should
answer and show, grounded in what exists today.

---

## 1. Current state (confirmed by reading the actual page)

`app/host/reports/page.tsx` today is: three stat cards (Completed quizzes / Venues
reported / This month), and a plain list of finished sessions (date, venue name,
quiz plan name, a static "Completed" status badge). No scores, no team data, no
per-venue trends, no export, no drill-down into an individual session. This
matches the platform review's finding exactly — this document specifies what
replaces it.

---

## 2. Who's asking, and what they actually want to know

Two distinct audiences, since Reports serves different purposes depending on
where Sonya is in the business (per the commercial-launch doc's sequencing —
freelance host first, other hosts later):

**Sonya, running her own shows across multiple venues (now):**
- "Did tonight go well?" (immediately after a show)
- "Which of my venues are worth keeping / worth pitching harder to?" (over time)
- "Am I running quizzes often enough to make this worthwhile?" (business health)
- "What happened when something went wrong?" (troubleshooting, ties into the
  reliability-acceptance-checklist's issue log)

**A future second host, once the commercial-launch data-isolation gate clears:**
- The same questions, scoped to their own venues/quizzes only — Reports needs to
  work identically for a single-host account as it will for a multi-host one, just
  correctly scoped. Nothing in this spec assumes multi-host reporting (e.g. a
  company-wide view across several hosts) — that's out of scope here and would be
  a separate, later spec once the commercial segment in §1 of the commercial-launch
  doc is actually being sold to.

---

## 3. Per-session detail (drill-down, new)

Clicking any row in the list today does nothing — it should open a per-session
report with:
- **Final leaderboard**: every team, final score, placement — not just "who won."
- **Round-by-round breakdown**: points scored per round per team, so a host can
  see which round was a blowout vs. close.
- **Question-level stats** (if useful without overwhelming): which questions had
  the lowest correct-answer rate across all teams — directly useful feedback on
  question difficulty/quality, and ties into the AI question-governance
  difficulty-confidence tagging from `question-quality-and-acceptance.md`.
- **Team turnout**: number of teams that joined vs. number that actually
  submitted at least one answer (distinguishes "nobody showed up" from "people
  joined but the tech didn't work").
- **Power Cards played**: which cards were used, by which teams, and when — useful
  both for troubleshooting ("did Reverse actually apply correctly that night") and
  for noticing patterns (are Power Cards being used at all, or ignored).
- **Duration**: start time to end time — useful for planning how long a typical
  night actually runs versus how long it's budgeted for.

## 4. Per-venue trends (new — the single most valuable addition)

This is the "which venues are worth it" answer, and doesn't exist in any form
today:
- **Quizzes hosted at this venue, over time** (a simple count/list, filterable by
  date range).
- **Average team turnout at this venue** — a venue that consistently draws 15
  teams is a different proposition from one that draws 4, and this should be
  visible without manually reviewing every past session.
- **Returning teams**: how many team names recur at this venue across multiple
  nights (a reasonable proxy for player loyalty/retention, even without formal
  player accounts) — directly answers "are the same people coming back."
- **Trend direction**: turnout this month vs. last month, per venue — simple
  up/down indicator, not a full chart necessarily, just enough to flag "this venue
  is growing" or "this venue is declining" at a glance.

## 5. Business-health summary (replaces/extends the current 3 stat cards)

Keep the existing three (Completed quizzes / Venues reported / This month) but
add:
- **Quizzes per week/month trend** — is Sonya's own hosting volume growing,
  flat, or shrinking.
- **Busiest/quietest venue** this month — a fast way to spot where attention is
  needed.
- **Average team count across all sessions** — a single business-health number
  worth seeing at a glance without digging into individual sessions.

## 6. Exportable results (new)

- **Per-session export** (CSV or PDF) of the final leaderboard and round-by-round
  breakdown — for handing to a venue manager who wants proof of turnout/engagement,
  or for Sonya's own record-keeping outside the app.
- **Per-venue export** of the trend data from §4, over a selected date range —
  useful as the concrete "here's your night's numbers" leave-behind when pitching
  a venue to continue or expand a booking.

## 7. Data model implications (for Codex to confirm/design against)

This spec assumes the following data already exists or is a reasonable extension
of what's already captured (Codex to verify against the actual schema rather than
this being treated as confirmed):
- `sessions` already has venue/quiz-plan linkage and a `finished` status (used by
  the current page).
- `scores` (per the atomic scoring migrations already in place) has per-team
  final totals and round points — the per-session leaderboard and round breakdown
  should be derivable from this without new tables.
- `game_history` (referenced elsewhere this session, e.g. `doSendQuestion`'s
  logging) may already capture enough to compute question-level correct-answer
  rates — confirm before assuming a new table is needed.
- Returning-team detection (§4) needs team names compared across sessions scoped
  to the same venue — a straightforward query against existing `teams`/`scores`
  data, not a new tracking mechanism, unless team names prove too inconsistent
  (typos, minor variations) to match reliably, in which case flag that back to
  this spec rather than silently under-counting returning teams.

## 8. What's explicitly out of scope here

- Multi-host/company-wide reporting (a company account seeing all its hosts'
  results) — deferred to the commercial-launch segment expansion, not needed for
  a single-host or first-few-hosts launch.
- Predictive/forecasting analytics (e.g. "this venue will likely decline next
  month") — a genuinely later-stage feature, not part of this spec.
- Sponsor/advertiser impression reporting (venue offers/ads screen-time
  tracking) — already flagged separately in the platform review's "bigger
  strategic bets," a distinct feature from quiz-performance reporting.
