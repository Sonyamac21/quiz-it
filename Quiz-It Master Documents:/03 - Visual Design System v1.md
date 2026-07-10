# QUIZ-IT VISUAL DESIGN SYSTEM

**The implementation guide — every visual rule, specified**
Quiz-It · Powered by Mac Entertainment · by Sonya Mac
Version 1.0 · July 2026 · Governed by the Experience Bible v1.0; informs the Handset Spec and Live Show Spec

All values are design tokens. Engineers implement tokens, never raw values. If a needed value is not in this document, the answer is "use the nearest token," never "invent one."

---

# 1. COLOUR SYSTEM

## 1.1 Stage colours (backgrounds)

| Token | Hex | Use |
|---|---|---|
| `stage/deep` | `#0A0118` | Base background of every screen, every surface, every state. |
| `stage/raised` | `#150A2E` | Cards, panels, option bars — anything sitting on the stage. |
| `stage/overlay` | `#1D1140` | Second-level raise (a card on a card). Maximum stack depth. |
| `line/structural` | `#2E1A52` | All borders, dividers, inactive strokes. 1px only. |

Never: pure black `#000000` (dead), pure greys (off-brand — every neutral carries the violet undertone), white backgrounds anywhere.

## 1.2 Text colours

| Token | Hex | Use |
|---|---|---|
| `text/primary` | `#FFFFFF` | Questions, scores, headlines, button labels. |
| `text/secondary` | `#B9A8D9` | Supporting info, captions, Whisper text. |
| `text/disabled` | `#6B5A8E` | Disabled labels only. |
| `text/on-brand` | `#FFFFFF` | Text on purple fills. |
| `text/on-gold` | `#1A1205` | Text on gold fills (dark, never white — legibility on metallics). |

## 1.3 Brand 🔒

| Token | Hex | Use |
|---|---|---|
| `brand/purple` | `#BE26C1` | Wordmark "QUIZ-", primary buttons, active states, brand moments, bloom source. |
| `brand/purple-bright` | `#D94FDC` | Hover/pressed lift of brand purple; glow cores. |
| `brand/purple-deep` | `#8A1B8D` | Pressed fills, gradient dark stop. |
| `brand/bloom` | `#BE26C1` @ 8–24% | Radial atmosphere glows. Never above 24% opacity. |

## 1.4 Feature colours 🔒 (semantic — one job each)

| Token | Hex | Only ever means | Never used for |
|---|---|---|---|
| `feature/correct` | `#2EE06E` | Correct answers | Success toasts, confirmations, "online" dots, decoration |
| `feature/incorrect` | `#FF3B4E` | Incorrect answers, Reverse card | Warnings, timers, errors, destructive buttons, emphasis |
| `feature/boost` | `#FFC533` | Boost Power Card | Warnings, highlights, stars, ratings |
| `feature/timeout` | `#38A8FF` | Time-Out Power Card | Links, info banners, selection states |

Each feature colour ships with one `-dim` variant at 20% opacity for edges and washes (e.g. the Wipeout frame glint uses `feature/incorrect` @ 20% as edge light only).

## 1.5 Victory metals (finale only)

| Token | Hex | Use |
|---|---|---|
| `victory/gold` | `#E8C36A` | Champion only: podium first place, coronation, winner cards. |
| `victory/gold-deep` | `#B8923F` | Gold gradient dark stop. |
| `victory/silver` | `#C9CDD6` | Second place only. |
| `victory/bronze` | `#C08A5A` | Third place only. |

Metals appear exclusively in podium/champion/summary contexts. A metal appearing during normal play is a defect.

## 1.6 Warnings and errors — the deliberate absence

There is **no warning yellow and no error red** in Quiz-It, because yellow and red are semantically locked. System trouble (connection loss, host pause, failures) is communicated in the show's own voice: `text/secondary` copy, `brand/purple` slow pulse, dimmed stage. Urgency (timers) is expressed by contraction, pulse, and brightness — never by colour change. Destructive host actions use `text/primary` on `stage/overlay` with a double-confirm pattern (§4.11), not red buttons. This is a hard rule: the first red "error" banner breaks the colour language for every player in the room.

## 1.7 Background & surface hierarchy

Exactly three visual layers (Bible §2.4): **stage** (`stage/deep` + bloom) → **show** (`stage/raised` surfaces, full opacity, highest contrast) → **veil** (glass overlays, §6.1). Never stack more than `stage/overlay` depth; if a design needs a fourth layer, the design is wrong.

## 1.8 Contrast floors

Text and meaningful UI must meet: Display ≥ 7:1 against its background; Handset & Host ≥ 4.5:1 (Whisper text ≥ 3:1). All approved combinations above pass; new combinations must be checked before use.

---

# 2. TYPOGRAPHY

## 2.1 Families

- **Inter** — all UI and content text. Weights used: 400 (Whisper only), 600 (Support), 700/800 (Statement). No other weights.
- **Bruno Ace SC** 🔒 — wordmark, "SPIN TO WIN" titles, "THE HARD DECK" titles. Nothing else, ever.
- Numerals that change (scores, timers, counts, gaps) always use tabular figures (`font-variant-numeric: tabular-nums` behaviour).

## 2.2 Type scale — Display (designed at 1920×1080; scales proportionally, §8.2)

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `display/statement-xl` | 120 / 1.05 | 800 | "CORRECT", "TIME'S UP", champion name, countdown numerals (up to 400px, see below) |
| `display/statement` | 84 / 1.1 | 800 | Questions (3-line max), pot totals, final ranks |
| `display/support` | 44 / 1.2 | 600 | Answer options, team names, captions, receipts ("9 of 14 teams…") |
| `display/whisper` | 26 / 1.3 | 400 | Metadata, branding badge, footnotes |
| `display/numeral-hero` | up to 400 / 1 | 800 | The Close countdown digits only |

TV readability rules: nothing below `display/whisper` ever renders on the Display; questions never exceed 3 lines at `display/statement` (rewrite, don't shrink); letter-spacing +2% on ALL-CAPS stamps; no text within the outer 5% safe area (§3.4).

## 2.3 Type scale — Handset (designed at 390×844 logical)

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `handset/statement` | 40 / 1.1 | 800 | Question, "LOCKED", points count-up, rank numeral |
| `handset/support` | 22 / 1.25 | 600 | Options, buttons, card text |
| `handset/whisper` | 14 / 1.35 | 400 | Status strip, helper lines, badges |

Nothing below 14px exists on the Handset.

## 2.4 Type scale — Host Dashboard

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `host/focus` | 34 / 1.15 | 800 | The primary action label, current answer |
| `host/data` | 20 / 1.3 | 600 | Team rows, insights, counts |
| `host/whisper` | 14 / 1.35 | 400 | Secondary metadata |

## 2.5 Universal rules

Three sizes of intent per surface — no in-between sizes may be introduced. Alignment: Display content centred; Handset options and Host data left-aligned (fast scanning); numerals right-aligned in columns. ALL-CAPS only for ceremonial stamps ≤ 3 words. No italics anywhere. Ellipsis truncation is banned on the Display — content is sized to fit or rewritten.

---

# 3. SPACING SYSTEM

## 3.1 Base unit

**4px.** All spacing uses the scale: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128`. No off-scale values.

## 3.2 Handset layout

Screen margin 24; gap between answer options 12 (dead space — a missed tap must hit nothing); action-zone buttons min height 64, full-width or half-width only; status strip height 48; the action zone occupies the bottom 40% of viewport (Handset A2), stage zone the middle, no tappable element above the stage zone during play.

## 3.3 Display layout

Content margin 96 from safe-area edge; single focal element per screen centred within the middle 70% of width; leaderboard rows height 96, gap 12; caption stamps sit in the lower third, never overlapping the focal element.

## 3.4 TV safe areas

All meaningful content inside a **5% overscan safe area** on every edge. The timer ring and full-bleed light effects may run edge-to-edge; text, numbers, and crests may not.

## 3.5 Host Dashboard layout

Margin 24; panel gap 16; the primary action button min height 96 and anchored bottom-right (thumb/mouse home position); dense data rows height 44 minimum; touch targets ≥ 44 everywhere (hosts run shows from tablets).

## 3.6 Grid

Display: 12-column, 24 gutter — but the grid serves alignment only; screens hold one focal element, not columns of content. Handset: single column, no grid. Host: 12-column, 16 gutter, three-region layout (§ Mission Control spec).

---

# 4. COMPONENT LIBRARY

Every component ships in exactly the states listed. No component may invent new colours, radii, or motion.

## 4.1 Corner radius family

| Token | Value | Use |
|---|---|---|
| `radius/s` | 8 | Chips, badges, small controls |
| `radius/m` | 16 | Buttons, option bars, cards |
| `radius/l` | 24 | Panels, question cards, dialogs |
| `radius/pill` | 999 | Timer chips, status pills |

No other radii. No fully square corners; no circles except the timer ring and crest badge.

## 4.2 Buttons

**Primary (one per screen max):** `brand/purple` fill, `text/on-brand`, `radius/m`, edge-light border (`brand/purple-bright` 1px @ 60%). States: rest / pressed (scale 0.97, fill `brand/purple-deep`, edge flare) / disabled (`stage/raised` fill, `text/disabled`) / charging (hold-to-commit: fill sweeps `brand/purple-deep`→`brand/purple` left-to-right over the hold duration).
**Secondary:** `stage/raised` fill, `line/structural` border, `text/primary`.
**Monolith (HIGHER/LOWER, STICK/GAMBLE):** half-width, height 96+, `handset/statement` label, edge-lit; STICK edge in `victory/gold` @ 40%, GAMBLE edge in `brand/purple-bright` — the only gold outside the finale, permitted because Stick *is* banking victory.
Never: text links, underlines, ghost buttons on the Display.

## 4.3 Cards (generic surface)

`stage/raised`, `radius/l`, 1px `line/structural`, shadow `depth/lift` (§6.2), internal padding 24. Content on cards is opaque — no transparency within the show layer.

## 4.4 Question cards

Display: card back uses `stage/overlay` with embossed crest watermark @ 6% white, edge light; face is `stage/raised`, question at `display/statement`, category chip (`radius/pill`, `display/whisper`) top-centre. Handset: question text sits directly on stage (no card chrome during play — chrome costs glance speed); the "deal-in" card back appears only in the pre-question state.

## 4.5 Answer options

Full-width bars, `radius/m`, height ≥ 64 (Handset) / 96 (Display). States: **neutral** (raised + structural border), **selected** (edge light `brand/purple-bright`, lift +2, others dim to 60%), **locked** (crest-stamped plate, purple seal), **revealed-correct** (`feature/correct` fill @ 16% + full-intensity `feature/correct` edge + white text), **revealed-wrong-mine** (`feature/incorrect` edge @ full, <1s, then recede to 40% opacity), **revealed-others** (dim to 25%). Option letters (A–D) in a `radius/s` chip, left.

## 4.6 Countdown & progress rings

**Timer ring:** 4px stroke at rest, full-viewport edge inset 8; colour blends `#FFFFFF`→`brand/purple` as it drains; final-five state: stroke thickens to 10px, contracts inward one step per second (steps of 12px), pulse glow per beat. The ring never turns red or yellow.
**Countdown numerals:** `display/numeral-hero`, stamped (§5.3), one per second, centred.
**Generic progress:** thin bars only (4px), `brand/purple` on `line/structural`. No spinners anywhere — waiting states use the breathing bloom instead.

## 4.7 Leaderboards

Row anatomy: rank numeral (tabular, right-aligned, width-reserved for 2 digits) · crest (40px Display / 28px Handset) · team name (`support`, truncation banned on Display — names are length-limited at entry) · score (tabular). Row states: **resting**, **climbing** (upward glow trail `brand/bloom`, caption chip "▲ up 3"), **falling** (no effect — settles only), **top-three** (metal edge: gold/silver/bronze @ 40%, finale contexts only; during play top-three carry `brand/purple` edge instead). Handset shows the you-centric module (rank hero + gap rows), never a scrolling table.

## 4.8 Power Cards

Aspect 2:3, `radius/l`, art-directed as premium playing cards: feature-colour deep gradient fill (e.g. Boost: `feature/boost` core → 40% dark stop), engraved Inter caps title (never Bruno Ace SC 🔒), crest watermark, 1px inner metallic line @ 30% white. States: in-fan (fanned −8°/0°/+8°), focused (rises, others dim), charging (light climbs bottom-to-top with hold), spent (desaturated 70%, dimmed slot), unavailable (face-down card back).

## 4.9 Podium

Three pillars, heights 3:2:1.5 ratio (1st:2nd:3rd), metal edge light per place, crest + name plate atop each. The first-place pillar has an **empty state** (risen, gold-lit, unnamed) — a required component state, per Live Show Moment 9.

## 4.10 Statistics cards & information banners

Stat card: `stage/raised`, one number at `statement` size + one `whisper` label. Never more than three stat cards visible at once. Banner (host messages, venue lines): full-width strip, `stage/overlay`, `text/secondary`, `radius/m`, no icons, auto-dismiss; never stacks — one banner max.

## 4.11 Dialogs & notifications

Dialogs exist on Host only (Display never shows dialogs; Handset uses full-screen states instead). Veil layer: glass (§6.1), `radius/l`, one title + one line + two buttons max. Destructive confirm pattern: primary action is the *safe* option; destructive option is a secondary button requiring a hold-to-commit. Notifications: Host-only toast, bottom-left, `stage/overlay`, single line, self-dismissing; never covers the primary action.

## 4.12 Tables

Host only. Row height 44, `line/structural` hairline separators, no zebra striping, no header background fills, tabular numerals right-aligned. The Display and Handset never render tables.

## 4.13 Icons

See §7. Host: icon + label always paired. Display: icons only for ▲/▼ movement glyphs and feature-card sigils. Handset: large functional glyphs only.

---

# 5. MOTION SYSTEM

## 5.1 Duration tokens

| Token | Value | Use |
|---|---|---|
| `motion/instant` | 80ms | Pressed states, ticks |
| `motion/fast` | 160ms | Selection, dimming, exits |
| `motion/standard` | 240ms | Entrances, card flips, layout shifts |
| `motion/moment` | 400ms | Stamps, reveals, seal animations |
| `motion/showpiece` | 700–1200ms | Leaderboard travel, podium rises, coronation elements |

Nothing exceeds 1200ms except host-held pauses (which are stillness, not animation).

## 5.2 Easing curves

| Token | Curve | Use |
|---|---|---|
| `ease/settle` | cubic-bezier(0.22, 1.2, 0.36, 1) | All entrances — fast arrival, slight overshoot, settle |
| `ease/exit` | cubic-bezier(0.4, 0, 1, 1) | All exits — accelerating out, faster than entry |
| `ease/land` | cubic-bezier(0.16, 1, 0.3, 1) | Count-ups decelerating, ring steps, travel ends |
| `ease/charge` | linear | Hold-to-commit fills only (honest progress reads linear) |

Linear is banned for all movement except `ease/charge` fills. No bounce beyond the single settle overshoot; nothing oscillates.

## 5.3 The stamp (signature entrance)

Ceremonial text ("TIME'S UP", "END OF ROUND 2", countdown digits): enters at 115% scale and 0 opacity → 100% scale, full opacity in `motion/moment` with `ease/settle`, plus one light-shock (bloom flare 120ms). Used for stamps only — regular content enters by rise-and-settle (translateY 16 → 0).

## 5.4 Standard behaviours

**Entries:** rise-and-settle, `motion/standard`. Staggered lists: 40ms per item, max 6 staggered items. **Exits:** fade + slight scale-down, `motion/fast` — exits never block entrances. **Hover (Host only):** edge-light brighten +20%, no movement (hover motion on a dense console is noise). **Score count-ups:** duration scales with delta, 400–900ms, `ease/land`, glow-pulse on landing; deductions drop in 240ms with no count. **Leaderboard travel:** rows move vertically in `motion/showpiece` with `ease/settle`; a moving row renders above resting rows; max two rows animate simultaneously. **Question transitions:** deal-in (`motion/standard`), host-held pause, single flip 300ms (rotateX one pass — no multi-spin). **Power Cards:** fan-in staggered `motion/standard`; launch: 400ms upward with light trail, `ease/exit`. **Celebration rule:** every celebration has a hard end state; peak ≤ 2s (play) / ≤ 4s (finale); after end, full stillness.

## 5.5 When NOT to animate

No ambient/looping animation except the breathing bloom (4s cycle, opacity only) and the draining ring. Nothing animates while the host is mid-hold. Nothing animates on the Host Dashboard except state changes ≤ `motion/fast`. No parallax, no scroll-triggered effects, no hover choreography, no attention-seeking idle wiggles. Two things animating at once on one surface is the maximum; three is a defect.

---

# 6. DEPTH SYSTEM

## 6.1 Glass (veil layer only)

Recipe: background `stage/overlay` @ 70% + backdrop blur 20 + 1px inner border white @ 12% + shadow `depth/veil`. Permitted: Host dialogs/sheets, Handset non-play overlays (rules, menus). Banned: anything in the show layer — questions, options, scores, leaderboards, podiums are always fully opaque.

## 6.2 Shadow tokens (violet-black, never grey)

| Token | Value | Use |
|---|---|---|
| `depth/lift` | 0 8 24 `#05000D` @ 50% | Cards, options |
| `depth/float` | 0 16 48 `#05000D` @ 60% | Focused cards, monolith buttons |
| `depth/veil` | 0 24 80 `#05000D` @ 70% | Glass overlays |

## 6.3 Glow & lighting

**Bloom:** radial `brand/bloom`, one per screen, behind the focal element only, diameter ≈ 1.5× the element. **Edge light:** 1px border in the element's light colour @ 60% + outer glow 8px @ 25% — the active/selected treatment everywhere. **Light-shock:** full-surface flare (white @ 8% or feature colour @ 12%) for 120ms on stamps and reveals — this is the effect that "lights the room." **The dim:** de-focused elements drop to 60% brightness (25% at reveal). Focus is made by darkening the rest 🔒.

## 6.4 Layer hierarchy

`z0` stage (bloom, texture) → `z1` show (all content) → `z2` travel (moving leaderboard rows, launching cards) → `z3` veil (glass) → `z4` system (connection strip). Fixed; no per-screen z-index invention.

---

# 7. ICONOGRAPHY

Style: geometric line icons, single weight. Grid 24×24 with 2px padding; stroke 2px (scales with icon: 1.5px at 16, 3px at 40+); round caps and joins; corner radius inside icons matches `radius/s` proportionally; no fills except state dots; no two-tone, no gradients within icons, no emoji anywhere in the product. Colour: inherit text colour; feature-coloured only when representing that feature. Movement glyphs ▲▼ are typographic, not icons. Host icons always labelled; if an icon needs explaining, it's the wrong icon. New icons must be approved against this grid before use.

---

# 8. RESPONSIVE RULES — ONE PRODUCT, THREE COSTUMES

## 8.1 What never changes

Palette, radius family, easing curves, duration tokens, stroke weights, the three-layer depth model, the three-sizes-of-intent rule, the bloom/dim lighting language. A screenshot from any surface must be recognisably the same product at a glance.

## 8.2 Display (TVs, projectors)

Design at 1920×1080; scale all tokens proportionally to viewport height (a 4K screen renders identical composition, sharper). Ultra-wide: content stays in the central 16:9 zone; stage bloom extends full-bleed. Never reflow — the Display has one layout per state, scaled. Low-end TVs are the floor: contrast floors (§1.8) and the no-blur-in-show-layer rule exist for them.

## 8.3 Handset (phones)

Design at 390×844; fluid width 320–480; beyond 480 (tablets), the layout centres at 480 max-width on the stage — the controller does not become a tablet app. Thumb map proportions (A2) hold at all heights. No scrolling during timed play at any size 🔒; if content can't fit at 320 width, the content is cut, not scrolled.

## 8.4 Host Dashboard (laptops, tablets)

Design at 1280×800 minimum; three-region layout compresses by collapsing the insights region into tabs below 1100 width — the primary action button and show-state region never shrink or move. All targets ≥ 44 for touch hosting. The dashboard never adapts into a phone layout; below 900 width it displays "Mission Control needs a larger screen" in the show's voice.

---

# 9. IMPLEMENTATION REFERENCE — THE RULES OF USE

1. **Tokens only.** Any hex, px, ms, or curve not in this document is a defect, not a choice.
2. **Semantic colours are law 🔒.** Green/red/yellow/blue/gold usage rules (§1.4–1.6) override every other consideration, including aesthetics.
3. **One focal element per screen** — enforced by the bloom: a screen may contain only one bloom, so it can only point at one thing.
4. **Three type sizes per surface.** A fourth size is a design-review failure.
5. **Bruno Ace SC appears in exactly three contexts 🔒** (wordmark, Spin to Win title, Hard Deck title). Lint for it.
6. **Motion budget:** max two simultaneous animations per surface; every animation uses a duration token and a named curve.
7. **The Display never renders:** dialogs, tables, spinners, links, form fields, ellipses, icons (beyond ▲▼ and card sigils), or any text below `display/whisper`.
8. **The Handset never renders:** scrollable containers during play, sounds by default, more than one primary action.
9. **When in doubt:** dark stage, white type, purple light — and the nearest token.

*End of Visual Design System v1.0.*
