# QUIZ-IT ACCESSIBILITY STANDARD

**The standard for every Quiz-It experience**
Quiz-It · Powered by Mac Entertainment · by Sonya Mac
Version 1.0 · July 2026 · Accessibility Director's specification, governed by all locked references

---

# 1. THE PRINCIPLE

Quiz-It's accessibility promise is stated in the show's own terms:

> **Everyone in the room gets the same show.** No one should need perfect eyes, perfect ears, perfect hands, or a perfect phone to feel like a contestant.

Two structural advantages make this achievable, and this standard leans on both deliberately:

1. **Quiz-It is team play.** A team is a natural accessibility layer — one player reads, another taps, the table decides together. Design must never *require* this (solo dignity matters), but the format means no impairment excludes anyone from the night.
2. **Quiz-It is multi-channel by design.** Every important event already exists as light *and* motion *and* sound *and* haptics *and* words. Accessibility here is mostly the discipline of keeping those channels redundant — the locked rule "audio is amplification, never information" is already an accessibility rule.

The standard's floor: WCAG 2.2 AA behaviour wherever applicable, exceeded where the venue environment demands more (contrast, type size, touch targets).

---

# 2. COLOUR BLINDNESS

Roughly 1 in 12 men in the room cannot reliably tell the reveal's green from red. The locked semantic palette stays 🔒 — the fix is that **colour is never the only carrier**:

- **The reveal:** correctness is triple-coded — colour (green ignition), *behaviour* (wrong options collapse to near-black; one survivor stays lit — brightness contrast is fully legible in monochrome), and *words* ("CORRECT." on the handset; the surviving answer alone on stage). A fully colour-blind player reads every reveal by light and text alone.
- **The handset verdict:** never a bare colour flash — always colour + word + haptic (Hit-Cascade vs Thud differ physically).
- **Power Cards:** distinguished by colour *and* name *and* distinct card art (Boost/Time-Out/Reverse are never colour-only chips).
- **Feature colour pairs:** green/red never appear as adjacent, same-shape, same-size elements distinguished by hue alone, anywhere.
- **Verification rule:** every new screen state is checked in monochrome. If the state's meaning survives grayscale, it ships; if not, it fails regardless of beauty.

---

# 3. HEARING IMPAIRMENT

- **The show is 100% playable silent 🔒** — every game-critical event (question open, countdown, close, reveal, scores, set-piece states) has a visual of equal strength. A deaf player misses atmosphere, never information. This is already law; this standard makes it testable: run any show muted and score it — nothing may be lost but mood.
- **The countdown** is the model: numerals, contracting ring, room-light flares, *and* synchronized handset Pulses — a deaf player feels the final five seconds in their hand.
- **Captions:** all system speech-equivalents are already text (the show has no voiceover 🔒). The live host's voice is the one channel we cannot caption — mitigations: every host script beat that carries *game consequences* (rule changes, round settings, "Danger Zone is on") must also appear as a Display caption or handset state, never voice-only. Host guidance: face the room when speaking; the mic is not just volume, it's lip-reading light.
- **Haptics as parallel channel:** the five-gesture vocabulary is a complete "soundtrack for the hand" — distinct enough (single/double/rising/heavy/ripple) to be told apart without hearing the room.

---

# 4. VISION IMPAIRMENT

- **Low vision:** the system already runs on oversized type, three-size hierarchies, and 7:1 Display contrast — maintain, and add: the handset respects OS text-size settings up to 130% without breaking the no-scroll law (layouts compress spacing before shrinking targets); the handset mirrors all Display-critical text (a player who can't read the big screen plays entirely from the phone — the handset is a personal repeater by design).
- **Screen readers:** the join flow, lobby, team naming, scores, and post-game summary must be fully screen-reader traversable with meaningful labels in the brand voice ("Lock it in, button" — never "btn-submit"). Timed play is honestly harder: every state change announces itself (question text, options, time remaining at intervals, verdicts), and answer options are first-class focusable elements in a stable order. A blind player with a fast screen reader and a good team plays the whole night; the standard's target is that *nothing in the interface* — as opposed to the time limit itself — is ever their obstacle.
- **Photos and images:** picture questions get host-read descriptions as the norm (the host reads every question aloud — brief this in host training as a rule, not a courtesy).
- **Never rely on** placement memory alone: buttons never swap positions between states (the thumb map is also a non-visual map).

---

# 5. LARGE DISPLAYS & THE ROOM

- Minimum legible sizes are set by the *farthest table*, not the screen: the Design System's Display scale assumes ~10m viewing on a 55"+ screen; venues seating farther must use larger or repeater screens (Ops Manual §1.2) — accessibility includes the back of the room.
- Glare, reflections, and sightline occlusion are accessibility failures, handled in venue setup.
- **Photosensitivity — hard limits:** no element flashes more than 3 times per second; light-shocks are single events, never trains; full-screen luminance changes (the crack, stamps) are single transitions with ≥250ms between events; the coronation's gold flood is a sustained state, not a strobe. No sanctioned effect in any locked document violates this — new effects must be checked against it before they exist.

---

# 6. HANDSET ACCESSIBILITY

- **Motor:** touch targets already exceed guidelines (≥64px bars, dead-space separation, full/half-width only); two-stage lock prevents error-by-tremor as well as error-by-drink; hold-to-commit durations must be adjustable (players who cannot sustain a press get a double-tap-to-commit alternative in handset settings — same ritual weight, different motor demand). All play is single-thumb, zero-gesture: no swipes, drags, pinches, or shakes anywhere in timed play 🔒.
- **Haptics:** always paired with a visual twin (haptics are an *additional* channel, never the only one — phones on tables, silent modes, and haptic-off settings must lose nothing); intensity respects OS settings, and a "reduce haptics" option keeps only Lock and the reveal Hit.
- **One-handed and one-switch reality:** everything reachable in the bottom 40% remains the law; the handset works identically for a player using a stylus, a knuckle, or an assistive switch via the OS.

---

# 7. TIMING

Time pressure is the format — it cannot be designed out, so it is designed *fair*:

- The host's **+15s** extend exists for exactly this and host training says so explicitly: extending for a table that needs it is showmanship, not charity ("I'm giving the room fifteen more — this one's evil").
- Per-question timers are generous by type (already locked: more time for typed answers than taps); reading time is protected — the question always lands *before* the clock starts, on the host's trigger, so a slow reader's clock never starts early.
- Venues/hosts can run a **relaxed pace profile** (longer defaults across the board) for afternoons, mixed-ability events, or corporate groups — same show, same drama, slower clock. The Close's five seconds stay five seconds; what grows is the calm time before it.
- Nothing except answering is ever time-limited: joining, naming, menu choices, Stick-or-Gamble deliberation (team-paced by design), and post-game screens have no timeouts.

---

# 8. READABILITY & LANGUAGE

- Question copy standards: plain sentence structures, no double negatives, no idiom-dependent phrasing (locked content rules already demand internationally legible questions — dyslexia-friendly and ESL-friendly are the same discipline).
- Typography already serves readability (Inter, generous line height, 3-line cap, no italics, no ALL-CAPS sentences); add: never justify text (ragged right always), never hyphenate across lines on the Display.
- Numbers and time are shown numerically, consistently placed, in tabular figures — glanceable for everyone, crucial for some.
- The Brand Voice's short-line law is an accessibility law too: every system message parses in one read.

---

# 9. MOTION SENSITIVITY

- **Reduce Motion:** the handset honours the OS reduce-motion setting and offers its own toggle. In reduced mode: entrances become fast fades, travels become dissolves-in-place, particles are replaced by static light states, count-ups land instantly with a single pulse. The *information* and *timing* of the show are identical — only the kinetics calm down.
- The Display has a venue-level reduced-motion profile (same substitutions) for venues that request it.
- Structural protections already in the language: no parallax, no continuous ambient motion beyond the 4s bloom breath, no oscillation, no camera-style zooms or pans, screen-shake banned outright 🔒. Vestibular triggers are largely absent by design; this standard locks the door behind them.

---

# 10. THE ACCESSIBILITY TEST NIGHT

Before any major release, one full show is run four ways: **muted** (deaf pass), **grayscale** (colour pass), **screen-reader joined** (vision pass), and **reduce-motion + reduce-haptics** (sensitivity pass). Each pass has the same bar: the player still feels like a contestant — never a spectator of other people's show. Any state where a pass-player loses game-critical information, misses a turn they were entitled to, or is addressed with less dignity than any other player, blocks release.

*End of Accessibility Standard v1.0.*
