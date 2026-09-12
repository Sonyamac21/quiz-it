# Commercial Launch: Positioning & Readiness for Multi-Host Subscription

Owner: Claude (product/commercial spec). This document is written specifically for
the scenario Sonya described: launching Quiz-It commercially to **other hosts**, as
a paid subscription/product — not just running it herself for her own venues. That
distinction matters throughout: a tool one person operates carefully is a different
risk profile from a product other people pay for and rely on. Where the two goals
(Sonya's own use vs. selling to others) diverge, this document flags it explicitly.

This connects to two things already on record: the platform review's "multi-venue /
white-label readiness" strategic bet, and the existing open task **"Multi-host
rollout: legal docs, branding, data isolation."** That task is not a nice-to-have
alongside this commercial push — it is a prerequisite for it, per the readiness
findings in §5 below.

---

## 1. Who is the customer, precisely

Before writing sales copy, the target buyer needs to be named specifically, because
"other hosts" covers at least three different buyers with different needs:

- **Freelance/solo quiz hosts** — one person running quiz nights at multiple venues,
  wants their own branding, their own question library, their own venue roster.
  Likely the primary target given Quiz-It's current shape (one host console, one
  question library per install).
- **Small quiz companies** (2-5 hosts under one brand) — need shared question
  libraries across their hosts but separate live sessions, and likely a company-level
  view of all their hosts' bookings/reports.
- **Venues running their own quizzes in-house** — a pub or bar that wants to run its
  own nights without hiring an external host. Different pricing sensitivity (venues
  expect a much lower price point than a professional host who's making a living
  from quiz nights).

**Recommendation:** launch to freelance/solo hosts first. It's the closest fit to
what's built today (single host identity per install), avoids the shared-library/
team-management complexity of the small-company case, and avoids the pricing
mismatch of the venue-direct case. Expand to the other two segments only once
multi-tenancy (§5) is genuinely solid.

---

## 2. Sales proposition (host-facing, not venue-facing)

Distinct from the venue-facing pitch already written in the platform review — this
is "why would a working quiz host pay for Quiz-It instead of SpeedQuizzing (or
running their own spreadsheet-and-buzzer setup)":

> **Quiz-It gives you the tools to look like a bigger production than you are.**
> Branded venue intros, theatrical rounds most quiz hosts have never offered, and
> in-the-moment show-control tools (block a team, scramble their keyboard, surface
> who's winning) that let you actually perform the room instead of just reading
> questions off a screen.

Supporting points, aimed at a host evaluating tools to build their own business:
- Every round type from the platform review (Hard Deck, Pursuit, Hot Seat, Nearest
  Wins, Multi Tap) differentiates a host's night from a generic phone-quiz app —
  this is inventory a host can sell to venues as "not the same as what everyone else
  offers."
- AI-assisted question generation lowers a host's weekly prep time, a real
  operating-cost saving for someone running multiple nights a week.
- No player app download reduces the host's own support burden (fewer "my app won't
  load" messages from confused pub-goers mid-show).
- Per-venue branding lets a host present each of their venues as having "their own"
  show, which is a real differentiator when a host is trying to win or keep a
  venue's business against a competing host.

---

## 3. Pricing/package concepts (starting point, not a final decision)

Offered as concepts for Sonya to react to, not a recommendation to implement as-is —
pricing is a business decision that depends on margins and target volume she hasn't
shared:

- **Per-host monthly subscription**, tiered by number of venues/quizzes per month
  (mirrors how a working host's revenue scales) rather than SpeedQuizzing's
  per-activation credit model — a recurring subscription is easier for Quiz-It to
  forecast revenue against, and easier for a host to budget against once they trust
  the price won't change per-event.
- **A free/trial tier** capped at one venue and a small quiz-count per month, so a
  host can genuinely evaluate the theatrical round types and host tools before
  paying — SpeedQuizzing's own onboarding friction (its reviews mention login/
  connectivity issues) is an opening for Quiz-It's trial experience to be
  noticeably smoother.
- **An annual discount** for hosts who commit, standard SaaS practice, useful for
  early cash flow.
- Explicitly **not recommended**: a per-player or per-event-attendance fee — it
  penalises a host's own success (more players joining a night should never cost the
  host more) and is a harder sell than a flat subscription.

---

## 4. Demo script (for a sales call with a prospective host)

A concrete, ordered sequence — not a slide deck, a live-click-through script:

1. **Open on a branded venue TV screen** (not the host console) — the visual payoff
   should come first, before any admin-screen explanation. Show the venue showreel,
   logo, host photo.
2. **Show one theatrical round live** — Hard Deck or Pursuit, whichever demos best
   visually — this is the single strongest differentiator against SpeedQuizzing and
   should get the most screen time in the demo.
3. **Show one host-only tool in action** — block a team or scramble a keyboard —
   framed as "this is you controlling the room, not just reading questions."
4. **Show the tap-a-team stats popup and round-leader toggle** — framed as "you can
   build drama the room feels, in real time."
5. **Only then, show the prep side** — Quiz Plan builder, AI generation, Question
   Library — framed as "and here's how little time this takes you during the week."
6. **Close on the winner reveal** — victory song, photos, podium — the emotional
   high point, saved for last deliberately.

Do not open a demo call with the Back Office/admin screens — a prospective host is
buying the show experience, not a database interface, and should see that first.

---

## 5. Launch readiness: what genuinely blocks selling this to other hosts

This is the section most important to get right, and where I'm deliberately not
softening findings to make the commercial pitch sound more ready than the code is.
Checked directly against the actual Supabase migrations (not assumed):

**Critical — multi-tenant data isolation does not appear to exist yet.** Across the
migrations, only 2 reference `auth.uid()` (genuine per-user row-level restriction);
6+ policies use `using (true)` (open to any authenticated user, no ownership check
at all). In practice, this means: if Sonya sells a second host an account today,
that host can very likely read and write Sonya's venues, quizzes, question library,
sessions, and scores — and vice versa — because the database does not currently
distinguish "whose data is this" for most tables. This is not a polish item; it is
the single hard blocker on selling subscriptions to other hosts, full stop. Nothing
in the pricing/positioning sections above should be acted on commercially before
this is fixed and independently verified (this is exactly the "dedicated Supabase
security review" Codex already owns from the earlier platform review — that review
needs to happen, and needs to specifically test cross-host access with two real
accounts, before onboarding a second paying host).

**Needed alongside data isolation, not after it:**
- **Billing/subscription infrastructure** — none exists today (no Stripe or
  equivalent integration referenced anywhere in the codebase). This is new build,
  not a configuration change.
- **Host self-signup and account management** — today's app assumes one operator
  (Sonya). A commercial launch needs a signup flow, account settings, and a way for
  a host to manage their own venues/branding without Sonya provisioning it by hand.
- **Terms of Service and Privacy Policy** — required before taking payment from
  other businesses, and specifically necessary given the app collects player photos
  and team data — this is a legal-review task, not an engineering one, but it blocks
  launch equally.
- **Per-host branding scoping** — confirm venue/host branding (logos, host photos,
  colour theming) is stored per-host-account, not globally — connects to the
  platform review's "white-label readiness" finding.

**Not yet urgent for a first freelance-host launch, but flag for later:**
- Shared question libraries across multiple hosts under one company account (only
  relevant once selling to the "small quiz company" segment from §1).
- Usage-based billing/metering (only relevant if pricing moves away from flat
  subscription tiers).

**Recommended sequencing:** treat §5's critical item as a go/no-go gate — no other
host gets a real account until the data-isolation review is complete and verified
with two real test accounts checking they cannot see each other's data. Everything
else in this document (positioning, demo script, pricing) can be prepared in
parallel, since none of it requires code changes to draft, but none of it should be
acted on commercially — no sales calls promising availability, no accounts actually
provisioned for a paying second host — until that gate clears.

---

## 6. Case-study and analytics requirements (for once live)

Once a small number of paying hosts are live, the material needed to sell further
(both to more hosts and back to venues) is:
- Host-level usage stats: quizzes run per month, average team turnout, retention of
  venues booked repeatedly — the analytics dashboard from the platform review's
  "bigger strategic bets" section serves double duty here (useful to Sonya AND as
  a sellable proof point to prospective hosts: "here's what a Quiz-It host's month
  looks like").
- At least one detailed case study once available: a specific host's before/after
  (e.g. "used to run a generic phone quiz, switched to Quiz-It, here's what changed
  for their booking rate") — concrete numbers beat generic testimonials.
- Player-facing shareable recap cards (from the platform review) double as organic
  marketing once real hosts are live — every team that shares one is free
  distribution to that team's own social circle, which is worth tracking as a
  metric (recap shares per quiz) once it exists.
