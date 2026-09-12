# Visual & Brand Specification

Owner: Claude (visual review / product spec). Consumed by: Codex (Sprint 4 —
responsive implementation, motion system, media scaling) and Claude (contained
UI-only implementation where applicable, per the ownership agreement). This is a
structured critique and specification, not a rewrite request — it works from the
design system that already exists in `app/globals.css` (`--qi-*` custom properties:
colour, spacing, radius, type scale, motion durations, z-index layers) and specifies
where that system should be applied more consistently, plus new rules for animation
intent, venue promotion sequencing, and result-state consistency across host, TV,
and phone.

**Important scope note:** I do not have a running instance of the app to screenshot,
so this is a code-level review (CSS + component structure), not a pixel-level visual
audit. Treat §2 (consistency) as high-confidence — it's verifiable directly from the
stylesheet and component code. Treat §3-6 (animation intent, promotion sequencing,
result states) as design intent to implement against, which should be spot-checked
against actual screenshots or a live run-through before Codex builds against it at
scale.

---

## 1. The existing token system (confirmed present, underused)

`app/globals.css` already defines a complete token set:
- **Colour**: `--qi-bg-stage`, `--qi-bg-surface(-elevated/-interactive)`,
  `--qi-border(-strong)`, `--qi-text-primary/secondary/muted`,
  `--qi-accent/-bright/-deep`, `--qi-success`, `--qi-danger`, `--qi-warning`,
  `--qi-gold`, `--qi-focus`, `--qi-disabled`.
- **Elevation**: `--qi-shadow-sm/md/glow`.
- **Radius**: `--qi-radius-sm/md/lg/pill`.
- **Spacing**: `--qi-space-1` through `--qi-space-12`.
- **Type scale**: `--qi-type-xs/sm/body/lead/title/display`, plus
  `--qi-leading-tight/body`.
- **Motion**: `--qi-motion-instant/fast/standard/moment`,
  `--qi-ease-settle`.
- **Z-index**: `--qi-z-base/sticky/overlay/modal/toast`.

This is a mature system — the platform review's "design-system enforcement gap"
finding is not that the system is missing, it's that large parts of the host,
player, and display components bypass it with hand-typed inline `style={{}}`
objects using raw hex values and pixel numbers instead of these tokens. The fix
specified here is enforcement and consistency, not building something new.

---

## 2. Consistency rules (apply the existing tokens, don't invent new values)

- **Every new or touched component** should reference `--qi-space-*` for padding/
  gap/margin rather than a hand-typed pixel value, `--qi-radius-*` for border-radius,
  and the named colour tokens rather than hex literals. This is a rule for anyone
  touching a file going forward (Codex or Claude), not a mass find-replace sweep to
  schedule separately — enforce it incrementally as files are already being edited
  for other reasons, per the platform review's original recommendation.
- **Accent colour discipline**: `--qi-accent-bright` (the lighter magenta,
  `#e04de3`) should be reserved for primary actions and live/active state only —
  a selected filter chip, an armed toggle, a "live now" indicator. `--qi-accent`
  (the deeper `#be26c1`) is for secondary emphasis and borders. Today's card/button
  styling across `.qi-mc-*`, `.qi-player-*`, and `.lb-*`/display namespaces mixes
  these at similar visual weight in places, which flattens hierarchy — a screen
  with five equally-bright magenta elements draws the eye nowhere in particular.
  Audit each screen for "what should the eye land on first" and make sure only that
  element uses `--qi-accent-bright`.
- **Radius consistency**: cards should consistently use `--qi-radius-lg`, controls/
  buttons `--qi-radius-md`, small chips/badges `--qi-radius-sm` or `-pill` — confirm
  this mapping holds across `.qi-mc-team-card`, `.qi-player-*` cards, and display
  `.lb-reel-brand-panel`-style elements; any place using an ad hoc radius value
  outside this three-tier mapping should be corrected to the nearest token.
- **Shadow consistency**: `--qi-shadow-sm` for resting cards, `--qi-shadow-md` for
  anything elevated/modal, `--qi-shadow-glow` reserved specifically for
  active/celebratory moments (a card that just scored, a card mid-celebration) —
  not applied to static resting UI, where it currently appears in a few places and
  dilutes its meaning as a "something just happened here" signal.

---

## 3. Animation intent — three tiers, using the existing motion tokens

The existing `--qi-motion-instant/fast/standard/moment` tokens already imply a
tiering that isn't consistently mapped to intent. Formalising it:

| Tier | Token to use | Examples | Intent |
|---|---|---|---|
| **Functional** | `--qi-motion-instant` / `--qi-motion-fast` | Button press feedback, selection state, tap acknowledgement, keypad key press | Confirms an input was registered — should feel immediate, near-zero perceived delay |
| **Show** | `--qi-motion-standard` | Round intro transition, answer reveal, leaderboard sort/re-order, round-leader toggle switch | Signals a state change worth noticing but shouldn't hold up pacing |
| **Hero** | `--qi-motion-moment` (or slightly longer, purpose-built) | Winner reveal, Hard Deck card flip, Pursuit finish line, podium count-up | The emotional payoff moments — allowed to take longer, should never feel rushed |

Every new animation should be assigned to one of these three tiers explicitly
(in a code comment, if nowhere else) rather than picking an arbitrary duration.
`prefers-reduced-motion` handling already exists in a few places (confirmed in
`globals.css`) — extend that same treatmeant to any new Hero-tier animation added
under this system, since those are the longest and most disorienting for anyone
sensitive to motion.

---

## 4. Venue promotion sequencing (display screen)

The venue showreel/lobby screen cycles through several scenes (venue intro, offers,
prizes, tag-us, etc. — per `reelScenes` in `app/host/display/page.tsx`). Specification
for ordering and pacing, since the current order is a build artifact rather than a
deliberately sequenced one:

1. **Venue intro** (logo, name, host identity) — always first. This is the "whose
   show is this" moment and should never be buried after generic content.
2. **Tonight's specifics** (schedule, prizes) — second, while attention is still
   high.
3. **Venue offers/ads** — third. This is monetisable screen time (per the platform
   review's sponsor-revenue opportunity) but shouldn't open the sequence, since a
   player's first impression of "whose show is this" matters more than an ad.
4. **Tag-us / social** — last, right before the loop restarts, since it's the
   lowest-stakes content and a natural place for attention to have drifted by.

Each scene should hold long enough to be read once at a comfortable pace (roughly
6-8 seconds for a short scene, up to 10-12 for anything with more text) — confirm
actual current hold times against this range rather than assuming they're already
tuned; timing that feels right to someone who built the screen may read too fast to
someone seeing it for the first time.

---

## 5. Logo and photo presentation

- **Venue logos**: should render on a neutral/dark backing consistently — a logo
  designed for a white background can disappear or look wrong directly on the
  dark purple stage background (`--qi-bg-stage`) without a card/panel behind it.
  Confirm every logo placement (display screen, host console branding, any
  player-facing surface) sits inside a `--qi-bg-surface`-toned card rather than
  directly on the stage background.
- **Host photos**: should be treated consistently in aspect ratio and crop across
  every surface they appear (display "your host" card, any host-facing profile
  view) — a photo cropped square in one place and circular in another reads as
  unpolished even if each individual instance looks fine alone.
- **Team/player photos**: `TeamBadge` component already handles the fallback-to-
  initials case — confirm this same fallback treatment (not a broken image icon)
  is used everywhere a team photo might not be approved/present yet, including the
  winner/podium screens, which are a new-enough feature that this may not have been
  carried through consistently.

---

## 6. Player result-state consistency (host, TV, phone)

A team's "how did we do on that question" state should look and feel consistent
across all three surfaces that show it, even though the layouts differ:
- **Colour**: green (`--qi-success`) for correct, red (`--qi-danger`) for incorrect,
  neutral/muted for "no verdict yet" or for Nearest Wins' closer/farther framing
  (never red for "further away," per the existing design law already established
  this session — confirmed correct in `app/host/quiz/page.tsx`'s reveal logic,
  flagging here only to make sure it's replicated identically on the TV display,
  which should be double-checked against the same rule).
- **Timing**: the reveal (colour change from neutral to correct/incorrect) should
  happen at the same moment across host, TV, and player screens — a player seeing
  their own phone reveal red half a second before the TV does reads as a sync bug
  even if it's cosmetically minor.
- **Iconography**: once emoji are replaced with a real icon set (per the platform
  review's Quick Win #1), the same icon/glyph should represent the same concept
  everywhere — a checkmark always means correct, never repurposed for anything
  else, across all three surfaces.

---

## 7. What this document does not cover

Full component-by-component visual redesign, colour palette changes, or typography
selection — those are decisions for Sonya to make deliberately, not something to
infer from a code read. This document is about consistency and intent within the
system that already exists, not proposing a new one.
