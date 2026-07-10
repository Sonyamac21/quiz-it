# QUIZ-IT MOTION LANGUAGE SPECIFICATION

**How everything moves — the permanent reference for every future animation**
Quiz-It · Powered by Mac Entertainment · by Sonya Mac
Version 1.0 · July 2026 · Motion Director's specification. Extends Bible §3 and Design System §5 (both locked); where those documents give tokens, this document gives the *physics and the feel* behind them.

---

# 1. ANIMATION PHILOSOPHY

**Motion is punctuation** (Bible §3.1) — and this document adds the physical model behind the punctuation:

> Everything in Quiz-It moves as if it were **a solid object being placed by a confident stagehand in the dark.**

Not floating (no drift), not liquid (no morphing), not weightless (no linear glides). Objects in Quiz-It have **mass**: they arrive with momentum, settle with weight, and stay put. This single mental model answers most motion questions before they're asked: would a stagehand slide a card in slowly? Bounce it three times? Wobble it while it waits? No — placed, settled, still.

The three vows every animation takes:

1. **Move for a reason.** Every animation marks a state change. Motion during a state is a defect (two exceptions only: the breathing bloom, the draining ring).
2. **Never cost a beat.** The show's tempo is the host's. Any animation that makes anyone wait — host, player, room — is cut or shortened, however beautiful.
3. **Be still magnificently.** Stillness is a first-class element of the language. The frame after an animation ends must look composed, because it will be looked at a hundred times longer than the animation itself.

---

# 2. EASING — THE FEEL OF THE CURVES

Four named curves (tokens in Design System §5.2). What they *mean*:

- **`ease/settle`** — the signature. Fast approach, one slight overshoot (≤4% of travel), a firm settle. The feel: an object placed with confidence — momentum absorbed, not bounced. Used for every entrance and every landing.
- **`ease/exit`** — accelerating departure. The feel: leaving faster than it arrived, because leaving is never the show. Exits are always less interesting than what replaces them, by design.
- **`ease/land`** — long deceleration into rest, no overshoot. The feel: a number rolling to a stop, a row of rows completing its travel — precision landings where overshoot would read as sloppiness (counting money doesn't bounce).
- **`ease/charge`** — pure linear, hold-to-commit fills only. The feel: honesty. A charge that eases lies about progress; linear is the one place mechanical reads as *trustworthy*.

Banned: linear movement (except charge fills), elastic/rubber bounce, multi-oscillation springs, ease-in-out symmetry for entrances (symmetric curves feel institutional — Quiz-It arrives faster than it settles, always).

---

# 3. TIMING, ANTICIPATION, OVERSHOOT, INERTIA

**Timing** (tokens §5.1, restated as feel): 80ms = felt not seen · 160ms = seen not watched · 240ms = watched · 400ms = an event · 700–1200ms = a moment. Nothing exceeds 1200ms; longer drama is built from *held stillness between* animations, never slower animation. Two simultaneous animations per surface maximum; the second must be subordinate (a caption under a travel, never two travels).

**Anticipation** — used sparingly and asymmetrically. Quiz-It objects do not wind up before moving (wind-ups read as cartoon). Anticipation in this language is *environmental*: the stage dims a step before something arrives; the bloom tightens before a reveal; audio cuts before the countdown. The world inhales — the object itself just arrives. This keeps confidence (objects act decisively) while preserving theatre (the room senses things coming).

**Overshoot** — one overshoot, ≤4% of travel distance, settle within 100ms. Overshoot expresses *momentum*, not playfulness; it scales down as objects scale up (Statement-scale text overshoots ~1%; a small chip may reach 4%; the podium pillars overshoot 0% — monuments don't bounce).

**Inertia** — heavier things move slower and settle harder. The hierarchy of mass: chips/captions (light, quick, 160–240ms) → cards/options (medium, 240–400ms) → leaderboard rows (heavy, 700ms travels) → pillars/machines (massive, 700–1200ms, no overshoot, arrival felt in the audio sub). A moving object never stops dead: every stop is a deceleration, however brief. Nothing in Quiz-It "teleports" except the light itself (the crack's ignition is a light event, not a movement).

---

# 4. PARTICLE BEHAVIOUR

Particles are **weather, not decoration** — they exist in exactly three sanctioned systems:

1. **Confetti (Coronation only).** Behaviour: storm → drift → gone. Dense burst for ~2s (enough to read as weather across the room), honest gravity and air-drag decay over ~6s, individual pieces tumbling with varied rotation (uniform rotation reads as CGI), full clear within 10s — no infinite loop, no re-bursts unless host-fired. Palette: gold family + white only.
2. **Rising sparks (celebration accents).** Small counts (readable as individual points of light, never a fog), rising with slight lateral wander, dying by fade at ⅔ screen height. Used in Gear 2–3 celebrations; palette purple/white; ≤2s lifetime.
3. **The light trail (travel emphasis).** Not strictly particles: the fading streak behind a climbing leaderboard row or launched Power Card. Decays in the object's wake within 400ms; the trail's job is to make *path* legible, not to sparkle.

Particle laws: never over text; never during host holds; never on the Handset except the winners' gold moment; performance floor is the venue's cheapest TV, so counts are capped and every system has a defined end state (A8 battery law applies to the Display too — a screen running fans all night on idle particles is a defect).

---

# 5. GLOW BEHAVIOUR

Glow is **light with intent** (Design System §6.3 gives the recipes; this gives the physics):

- Glow *responds*, it doesn't idle. Edge light flares on state change and settles to its resting level within 400ms. A glow that pulses continuously is begging; the only breathing glow is the stage bloom (4s cycle, opacity-only, one per screen).
- Glow has a source. Every glow implies the object *emits* — so glow never appears detached from its element, never tints unrelated neighbours, and casts subtly on the stage beneath heavy objects (pillars, the machine) to seat them in the world.
- The light-shock (stamp flare, 120ms) is the loudest glow event: a full-surface flare that "lights the room." Budgeted like a cymbal — countdown stamps, reveals, ignitions — never for routine entrances.
- Intensity discipline: at any moment the brightest glow on screen belongs to the focal element. If a secondary element's glow competes, dim it — focus is made by darkening the rest 🔒.

---

# 6. TRANSITIONS

Between states, the language is **darken → place → light** (the stagehand model at screen scale):

- **The breath:** stage dims one step (`motion/fast`), old content exits accelerating, ≥120ms of held dark, new content arrives with settle, stage relights. Total ≤700ms; the breath is what makes phases feel like scenes.
- **Hard cut:** sanctioned only where scripted (the blackout that opens the Ignition; the cut-to-black before the podium). A hard cut is a Gear-3+ event; it may never become a convenience.
- **The takeover:** set-pieces (Spin to Win, Hard Deck) enter by flooding — title stamp + colour flood — replacing the world rather than transitioning within it. Exiting a set-piece always returns through the breath, re-establishing the base stage before play resumes (the room needs the "normal" restored so the next set-piece can violate it again).
- Never: wipes, slides-between-screens, crossfades of content (light may crossfade; *content* is placed), morphs, 3D flips beyond the single sanctioned card flip.

---

# 7. SCOREBOARD ANIMATION

Numbers are the show's currency and they behave like currency:

- **Count-ups** (`ease/land`): rolling tabular digits, duration scaling with delta (400ms floor, 900ms cap — a 5-point and 500-point gain must both feel right), glow-pulse on landing. The deceleration is the drama: the last few digits fall like a roulette ball choosing.
- **Deductions:** the drop — no count-down (watching digits fall is misery mechanics), a single 240ms heavier settle to the new value with a brief red-edge blink. Weight down, quickly done.
- **The pot** (Hard Deck): counts up per rung with one added glow layer per level; on bank, the numerals physically *travel* to the team's scoreline (the money visibly moves — 700ms, `ease/settle`); on bust, the pot doesn't count to zero — it *extinguishes* (light collapse, 400ms). Losing everything is an event of light, not arithmetic.
- Digits never jitter sideways (tabular figures 🔒), never blur-spin like a fruit machine (that's Spin to Win's owned behaviour, nowhere else), and never change without animation — a cut number is a spreadsheet.

---

# 8. LEADERBOARD MOVEMENT

The full physics of the show's plot device:

- **Builds:** rows arrive bottom-up, rise-and-settle, 3–4 rows/sec through the lower half, decelerating to 1 row/beat at the top five, full stop below the top three (the hold is part of the choreography and belongs to the host).
- **Travels (the overtake):** a climbing row lifts slightly off the surface (scale 1.02 + `depth/float`), travels vertically at heavy-object pace (700ms standard; +100ms per 3 ranks crossed, 1200ms cap), light trail in its wake, settles with a single overshoot and an edge-flare. Displaced rows shuffle down at 60% of the traveller's speed — the world yields, the mover cuts through.
- **Priority:** max two travels per board, sequenced not simultaneous; the bigger climb travels second (the show saves the better story).
- **Falls:** falling rows never travel — they are displaced (shuffled down softly as others rise past). No downward trails, no red, no motion that could be read as a fall animation 🔒. The camera never follows anyone down.
- **Rest:** between events the board is *stone* — no shimmer, no idle sway. Its stillness is what makes the next travel legible.

---

# 9. IMAGE REVEALS (picture questions & media)

Images enter the stage like exhibits, not attachments:

- **The unveil:** image arrives darkened to 30% and *lights up* to full over 400ms (`ease/land`) — light, not motion, is the reveal; a subtle scale-settle (1.03 → 1.00) gives it placement weight.
- Answer-critical detail is never animated: no slow pans (an image panning while sixty people race a timer is unfair by geometry — back tables see the crop later), no progressive de-blurs *unless the de-blur is the game mechanic itself*, in which case it runs in host-triggered steps, identical for the whole room, with each step a discrete placed state.
- On reveal of the answer, the image dims to 40% and yields the stage to the correct answer text — the exhibit clears for the verdict.
- Media hygiene: images always inside `radius/l` frames on the stage layer, never full-bleed (full-bleed is reserved for the show's own light moments), always letterboxed within the frame rather than cropped by it.

---

# 10. CELEBRATION HIERARCHY

The complete motion ration, in one table — the law that keeps the finale solvent:

| Gear | Event | Motion budget | Particles | Light | Duration cap |
|---|---|---|---|---|---|
| 1 | Correct answer (the crack) | Ignition + collapse; zero travel | None | Green light-shock, once | 2s to still |
| 1 | Points landing | Count-up + landing pulse | None | Glow pulse | 1s |
| 2 | Overtake / streak callout / round captions | One travel or one stamp | Light trail only | Edge flares | 3s |
| 2 | Spin to Win win | Machine light cascade | Rising sparks, brief | One room-flash | 3s |
| 3 | Hard Deck bank / Fast Track / final-question close | Travel + stamp + light cascade | Rising sparks | Multi-flare sequence | 4s |
| 4 | Podium rises | Pillar rises, no overshoot | None — the ascent is austere | Metal columns of light | Host-paced |
| 4 | **Coronation** | Everything: stamp at max scale, gold flood | Confetti storm → drift | Full-room gold, sustained | Storm ≤10s; state host-paced |

Two rules seal the hierarchy: **no gear may borrow from above** (a Gear-2 moment using confetti is a defect, not a flourish), and **every celebration ends in composed stillness** — the frame after the last particle dies must be a poster.

---

# 11. WHEN MOTION IS WRONG — THE CHECKLIST

Before any new animation ships, six questions. Any "no" kills it:

1. Does it mark a state change?
2. Does it use a named curve and a duration token?
3. Is it within its gear's budget?
4. Can the host's pace never be blocked by it?
5. Is the frame it leaves behind composed and still?
6. Would a confident stagehand move it this way?

*End of Motion Language Specification v1.0.*
