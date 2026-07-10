# QUIZ-IT HOST MISSION CONTROL — DESIGN SPECIFICATION

**The director's console**
Quiz-It · Powered by Mac Entertainment · by Sonya Mac
Version 1.0 · July 2026 · Governed by the Experience Bible, Handset Spec, Live Show Spec, Storyboards and Design System (all locked)

---

# PART A — THE DOCTRINE

The Bible settled this surface's personality: **calm authority — the gallery, not the fireworks.** The host is speaking continuously, holding a microphone, reading a room, and glancing at this screen in half-second slices. Every design decision below is judged by one test:

> **Can a performing host absorb it in one glance and act on it with one touch, without stopping talking?**

Three consequences:

1. **The console never performs.** No celebration ever plays here. When the room turns gold, the console stays calm — the host is the one person who must never be dazzled by their own show. Motion on this surface exists only to mark state changes, at `motion/fast` or quicker.
2. **The console is a script, not a database.** Everything is written to be *read aloud mid-sentence*. Not "accuracy: 0.83" but "Team Quizzly — 5 in a row." The console's true output is the host's next line.
3. **One big button.** At every phase of the show there is exactly one obvious next action, rendered as the largest control on screen. A host should be able to run an entire competent show by pressing only the big button, and a great show by garnishing it with everything else.

---

# PART B — THE MAIN DASHBOARD

## B1. The three-region layout

A fixed geography the host's eyes learn on night one and never relearn (regions never move, swap, or reflow mid-show):

- **LEFT — ON AIR.** A live miniature of what the Display is showing right now, always. Above it, the show clock and phase label ("ROUND 2 · Q4 · TIMER RUNNING"). The host never has to turn around to know what the room sees — the single biggest confidence gift a live console can give.
- **CENTRE — THE DESK.** The working surface: current question, answers coming in, insights, teams. Changes contents by phase; never changes position.
- **RIGHT RAIL — THE TRIGGER.** The big button (bottom-right, thumb home position, min height 96), with the *next two* upcoming actions previewed above it in dimmed sequence ("Next: Reveal → Standings"). Below it, the quick-action strip (B7).

**Visual hierarchy:** the big button is the brightest object (the only `brand/purple` fill at rest); ON AIR is second (it's how the host stays oriented); everything else sits in `stage/raised` calm. One bloom on the whole console — behind the big button.

**Why it improves hosting:** fixed geography means zero visual search. Half-second glances only work when everything is always where it was.

## B2. The big button — phase logic

The button always names the *show consequence*, not the software action: "DEAL QUESTION 5" → "FLIP IT" → "START THE CLOCK" → "REVEAL THE ANSWER" → "SHOW STANDINGS" → "START THE HARD DECK". Pressing it advances the show exactly as the Storyboards script it; the label is the host's cue card. It arms with a subtle edge-flare when its moment is ready, and it is *never* disabled without saying why in one Whisper line beneath ("Waiting: 3 teams still answering — or press to close early").

**Motion:** label changes by a 120ms crossfade — no bouncing, no pulsing for attention. **Interaction:** single press; show-critical irreversibles (skip round, end quiz) never live on this button.

---

# PART C — QUESTION CONTROL

## C1. The question desk (centre, during play)

- **The card:** current question at `host/focus`, with the **correct answer always visible to the host** beneath it in `feature/correct`-edged text, plus the explanation line (host-only — the stage never paragraphs). The host is never reading cold and never caught not knowing.
- **The clock:** a compact numeric countdown with the same final-five state as the room (dimmed, small — the host feels the Close without being shouted at).
- **Answers arriving:** a live strip — "11 of 14 in" — with each team's crest lighting as they lock. Crests light in *lock order*, giving the host the race narration free: "Quizzly Bears in first… half the room's still thinking!"
- **Question controls, one row:** **+15s** (extend, one press), **CLOSE EARLY** (hold-to-commit), **DUMP Q** (hold-to-commit; skips, never deletes — the round is a reusable template). Danger Zone state for this round shows as a small armed badge, toggled in round settings, not mid-question.

**Why:** everything a host says during a live question — the tease, the pressure calls, the answer patter — is on this one surface, formatted as material.

## C2. Reveal support

At reveal, the desk swaps to the post-question script: the receipt stat ("9 of 14 got it"), the fastest correct team, and — where scoring produced drama — one flagged line ("Fast Track available: Quizzly Bears were fastest — promote them?" as an explicit host choice). The answer/explanation panel persists through celebration so the host can keep riffing.

---

# PART D — TEAM MANAGEMENT

## D1. The team rail

A collapsible desk tab: all teams as rows (crest · name · score · rank · connection dot), sorted by rank, 44px rows, tabular numerals. Row states: connected (steady), reconnecting (slow purple pulse on the dot — never red; trouble is whispered, not alarmed), idle (dimmed 20%).

## D2. The team profile drawer

Tap any team row → a right-side glass drawer (veil layer) over the desk — the console's only overlay. Contents, in host-usable order: tonight's story ("4th · up 3 · 5-streak · fastest on Q7"), score with **manual adjust** (stepper + reason chip, applied instantly, logged to the night), Power Cards held/spent, connection state, and **rename/remove** (hold-to-commit). The drawer never covers ON AIR or the big button — the show stays visible and drivable while the host works.

**Why:** score disputes and table changes happen mid-patter. The drawer is built to be operated one-handed in under ten seconds while talking about something else.

---

# PART E — LIVE INSIGHTS

## E1. The insight cards

Four cards in a fixed desk row (never more — four is what a glance holds), refreshed at natural pauses (post-reveal, round end), **never mid-question** (numbers that change while being read aloud embarrass the host):

1. **BIGGEST SCORER THIS ROUND** — crest, name, points this round.
2. **FASTEST ANSWER** — crest, name, the time ("2.1s — Q4").
3. **BIGGEST CLIMBER** — crest, name, "▲4 tonight".
4. **HIGHEST ACCURACY** — crest, name, "9 of 10 correct".

Each card is one number, one name, one Whisper qualifier — written as a sentence-fragment the host can lift verbatim. Each card has a small **CAST** action: press to send it to the Display as a broadcast caption (the Act Break's third-caption mechanism, available any time the stage is idle). Insight → mouth or insight → stage, one press either way.

**Motion:** a card whose subject changed since last look carries a single edge-flare on refresh — the console's way of whispering "new material here."

**Why:** these four cards are the difference between a host who reads questions and a host who *narrates a night*. They are the show's colour commentary, pre-written.

---

# PART F — SET-PIECE CONSOLES

When a set-piece starts, the desk transforms into that event's director panel. Same geography: ON AIR left, big button right — only the desk changes.

## F1. Power Cards

A desk strip showing cards *in play tonight*: which teams hold what (by feature colour dot), and a feed line when one is played ("Quizzly Bears played BOOST — next question double for them"), mirrored from the stage announcement so the host can react without turning. Host override: enable/disable card play per round in round settings; cancel a played card from the team drawer (hold-to-commit, for disputes).

## F2. Spin to Win console

Phase-scripted to the Storyboard (Moment 6): the panel shows the earning team confirmation ("Fastest: Quizzly Bears — summon them?"), then one big trigger per act — **SUMMON → BUILD THE MACHINE → (team spins from their handset) → RESULT STANDS**. The console displays what the team's handset is doing ("charging… 2.1s") so the host narrates the press live. A single fallback control — **SPIN FROM HERE** (hold) — covers a dead phone without breaking the show.

## F3. The Hard Deck console

The night's most scripted panel, one trigger per act: **TITLES → SPIN THE WHEEL → (selection lands) → SET THE STAGE → open play**. During the climb the host sees: current card, cards-remaining lean ("higher is the safe call — 9 cards above, 3 below" — commentary fuel, phrased as odds-talk, never shown to the room), the pot, the rung, swap status. During Stick or Gamble the console mirrors the charging decision bar exactly as the stage shows it, plus both outcomes pre-written ("Bank = +20 · Bust = 0") so the host's mouth is already loaded either way. Wheel spin is **manual-trigger only** — the wheel never fires itself.

**Why:** set-pieces are where hosts get nervous. A one-trigger-per-act script turns the scariest ten minutes of the night into pressing "next" five times with commentary fuel on tap.

---

# PART G — AUDIO CONTROLS

A persistent bottom-left sound desk, two parts:

- **The bus:** one master fader for show audio, one **DUCK** latch (drops beds −12dB; auto-ducking under the mic is the norm, the latch is the manual override), and a **KILL** (hold — instant silence for announcements/emergencies; release restores).
- **The pads:** six one-shot pads, fixed order, muscle-memory positions: **Airhorn · Cheer · Applause · Sad Trombone · Round Sting · Heartbeat.** One press fires; pads light while playing; pressing again stops. Victory-song selection lives in end-of-quiz controls (H2), not here.

**Why:** hosts run comedy timing with one hand. Pads in fixed positions are playable blind — an instrument, not a menu. The trombone press timed perfectly to a wrong answer is worth more laughs than any animation we ship.

---

# PART H — QUICK ACTIONS, SHORTCUTS, END OF QUIZ

## H1. Quick actions & keyboard shortcuts

The quick-action strip (right rail, under the big button): **Pause show** ("Your host will be right back" state, one press on/off) · **+15s** · **Fast Track** · **Cast insight** · **Sound desk focus**. All also on keys — because many hosts run from a laptop with a clicker or keyboard:

| Key | Action |
|---|---|
| **Space** | The big button (advance the show) |
| **P** | Pause / resume show |
| **E** | +15 seconds |
| **R** | Reveal (when armed) |
| **L** | Show standings |
| **1–6** | Sound pads |
| **D** | Duck latch |
| **K (hold)** | Kill audio |
| **T** | Team rail |
| **Esc** | Close drawer/dialog |

Space-as-big-button is the whole show on one thumb of a presenter remote. Destructive actions have **no** shortcuts — dumps, removals and endings are deliberate touches only.

## H2. End of quiz controls

The finale panel replaces the desk when the last question closes, and it is deliberately a **pre-flight checklist**, not a button: final standings preview (exactly what the reveal will show — the host sees the winner before the room, always); the tie flag, if any, with the resolution rule stated; the **victory song** picker (search + preview-to-headphones/cue, defaulting to the house pick) — *chosen before the podium starts, never scrambled for during it*; the photo-ritual arm (on/off per venue); then one armed sequence of the two Gear-4 triggers: **BEGIN THE ASCENT** → (bronze, silver, the empty gold pillar, each on its own press) → **CROWN THEM**. After the bow: **END SHOW** (hold) → the console's only indulgence, a quiet one-line summary of the night ("14 teams · 47 questions · won by The Quizzly Bears") and "Same time next week?" scheduling prompt.

**Why:** endings are where amateur nights fall apart — wrong song, unspotted tie, winner leaked. A checklist that forces song, tie and photo decisions *before* the first pillar rises is what makes the finale feel inevitable instead of improvised. And the host seeing the winner early isn't a spoiler — it's what lets them perform the reveal like they wrote it.

---

# PART I — WHY THIS CONSOLE WINS NIGHTS

Every decision above traces to one of five hosting truths: **glances are half a second** (fixed geography, one big button, four insight cards); **the mouth never stops** (everything phrased as material, insights cast to stage in one press); **hands are busy** (Space-drives-the-show, pads playable blind, drawers one-handed); **nerves peak at set-pieces** (one-trigger-per-act scripts with commentary fuel); **endings make reputations** (the pre-flight finale). The console's ambition is the Bible's: after three shows it disappears into the host's hands, and the venue sees only a performer who has never looked more in control.

*End of Host Mission Control Specification v1.0.*
