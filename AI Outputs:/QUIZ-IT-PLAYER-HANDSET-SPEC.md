# QUIZ-IT PLAYER HANDSET — DESIGN SPECIFICATION

**The definitive handset experience**
Quiz-It · Powered by Mac Entertainment · by Sonya Mac
Version 1.0 · July 2026 · Companion to the Experience Bible v1.0

---

# PART A — HANDSET FOUNDATIONS

These constants govern every screen below. Screens reference them instead of repeating them.

## A1. The controller doctrine

The handset is not an app the player operates; it is **the controller for a show happening in the room**. Three consequences drive everything:

1. **The phone and the stage are one machine.** The handset mirrors the show's rhythm — when the Display counts down, the phone counts down; when the room erupts, the phone erupts in the palm. Synchrony is the single strongest "this isn't a website" signal we have.
2. **The phone tells *your* story; the Display tells the room's.** The handset is where private drama lives: your answer, your points, your rank, your streak. It never duplicates the Display — it personalises it.
3. **The phone knows when to bow out.** During the show's biggest shared moments, the handset deliberately hands attention to the big screen (the "Eyes Up" state, A6). A companion that competes with the stage makes the show smaller.

## A2. The thumb map

Every screen is built for one-handed use by a person holding a drink:

- **The action zone** — bottom 40% of the screen. Every tappable element during gameplay lives here. No exceptions during a live question.
- **The stage zone** — middle of the screen. The content being acted on (question, options, score). Read, never reached for.
- **The status strip** — top edge. Team identity, round, timer echo. Glanceable, never tappable during play.

Minimum touch target: full-width or half-width buttons at generous height — targets sized for a confident thumb press without looking, not a careful fingertip. Adjacent targets always separated by dead space so a sloppy press hits nothing rather than the wrong thing.

## A3. Handset type scale

Per the Bible's three sizes of intent, tuned for a phone in a dim room:

- **Statement** — one element per screen: the question, the lock confirmation, your points, your rank. Fills the width. Readable at arm's length on a table.
- **Support** — answer options, team names, button labels. Large by app standards.
- **Whisper** — status strip, branding badge, helper lines. Small, dim, rare.

Inter throughout. Tabular figures for every number that changes. No text smaller than Whisper exists anywhere on the handset.

## A4. Handset audio policy — silent by design

**A deliberate challenge to the brief's "Audio (if any)" prompt: the handset's default answer is "none."**

Sixty phones playing sounds in a venue is chaos: out-of-sync chirps, spoiled reveals, competing with the host's microphone and the Display's audio. The room already has a soundtrack — the show. The handset's sensory channel is **haptic**, which is private, silent, and felt through the hand even when the phone is on a table.

So: every screen below specifies haptics as a first-class channel; audio is omitted unless explicitly stated (the sole exceptions are noted in their screens, and even those default to off). This is a feature, not an absence — the phone that *taps you on the wrist* while the room roars feels like a secret channel between you and the show.

## A5. The haptic vocabulary

Five gestures, used consistently so the hand learns the language:

| Name | Feel | Meaning |
|---|---|---|
| **Tick** | Single light tap | Selection, small confirmation |
| **Lock** | Firm double-knock | Answer locked, decision committed — the "vault door" feel |
| **Pulse** | Soft rising heartbeat | Final countdown seconds, suspense |
| **Hit** | One heavy strike | Reveal moment, points landing |
| **Cascade** | Rapid celebratory ripple | Correct answer, rank climb, victory |

Losses and errors use a single muted **Thud** — brief, low, dignified. There is no punishing buzz anywhere in Quiz-It; the Bible's no-humiliation rule applies to the hand too.

## A6. The "Eyes Up" state

A signature invention of this spec. At moments when the room should be watching the Display — answer reveals, leaderboard reveals, Spin to Win, the podium — the handset drops to a near-black screen: the team crest small and dim, a soft purple bloom, and one Whisper line: **"Eyes up."**

Why this wins: it prevents the phone spoiling the stage; it physically lifts sixty heads at the same moment (which *creates* the shared audience the brand promises); and it makes the handset's active moments feel more special by contrast. The phone re-ignites with a Cascade haptic the instant it's the player's turn to act again — so players learn they can trust it: *the phone will tap me when I'm needed.* That trust is what lets them put the phone down, drink, laugh, and stay in the show.

## A7. Team identity — the crest

At join, every team receives a **crest**: an auto-composed geometric emblem (initial letters set in a faceted badge, purple-family tones, edge-lit). The crest is the team's face all night — status strip, leaderboard rows, podium, share cards.

No new colours are introduced (Bible §2.2 is closed); crests vary by *geometry*, not hue. This gives teams identity and pride without childish avatars or a rainbow leaderboard. The crest is deliberately trophy-like: something a team is pleased to see on the big screen.

## A8. Battery and heat discipline

A phone that dies at question 40 ends that player's night. Rules: animation is **event-driven, never ambient** — the handset is perfectly still between moments (stillness is also our suspense language); idle and Eyes Up states are near-black (dark pixels cost least); no continuous particle loops, no video textures, no perpetual shimmer; celebrations peak and *end*. The most premium thing a handset can do at 11pm is have battery left.

## A9. Transition grammar

All screen changes use the Bible's snap-and-settle: new states enter fast with a slight overshoot; old states exit faster. Between phases, the handset never hard-cuts from one layout to another — the stage darkens for a breath, then the new moment snaps in. The breath is what makes phases feel like *scenes* rather than page loads.

---

# PART B — THE COMPLETE JOURNEY

Each state specifies: Purpose · Layout · Hierarchy · Colour · Type · Motion · Haptics · Emotion. (Audio only where it exists — see A4.)

---

## B1. Joining the quiz

**Purpose:** Convert a sceptical phone-scan into the first "oh, this is different" moment. The join is the product's first impression and the one moment it risks feeling like a website — so it must be the first magic trick.

**Layout:** Full dark stage. The wordmark materialises centre (the only Bruno Ace SC on the handset all night), purple bloom behind it. Beneath: the venue's quiz name and tonight's date at Support size. One Statement-scale action in the action zone: **"Join the show."** Nothing else. No navigation, no menu, no footer.

**Hierarchy:** Wordmark → tonight's show → the button. Three things, in order.

**Colour/Type:** Deep stage `#0A0118`, purple bloom, white type. Button in Quiz-It Purple with edge light.

**Motion:** The wordmark doesn't fade in — it *ignites*: a fast bloom-up with settle, like a sign switching on. The button rises into the action zone a beat later.

**Haptics:** Tick as the button arrives — the phone's first sign of life. Players notice.

**Team name entry:** One screen, one question: **"Who are you tonight?"** — a Statement-scale centred entry styled as show graphics (glowing baseline, huge type as they write), never a bordered form field. The OS keyboard is unavoidable; we accept it for these ten seconds and make everything above it look like television. Names render live in the entry exactly as they'll appear on the big screen — instant feedback that "what I type here appears *there*." A Whisper line handles uniqueness gracefully: "That name's taken tonight — make it yours." A returning player instead sees **"Welcome back — rejoin as [team]?"** (see B22).

**Emotion:** *"That was it? I'm in?"* Joining must feel lighter than ordering at the bar. Curiosity → belonging in under fifteen seconds.

---

## B2. Waiting for the host (the lobby)

**Purpose:** Hold new players in warm anticipation without demanding attention. This is the show's overture; most players will be talking, not staring at the phone.

**Layout:** The team crest is born here — centre stage, assembling itself. Above: team name at Statement. Below, Whisper: "Waiting for your host…" plus a slow count of teams in the room ("14 teams in the room tonight"). Action zone: empty. There is nothing to do, and the screen is honest about it.

**Hierarchy:** Crest → team name → room count.

**Colour:** Near-black stage, single soft bloom breathing behind the crest — the only motion on screen.

**Motion:** The crest assembles once (facets snapping together, settle, edge-light trace) — a 2-second birth ceremony, then stillness. The bloom breathes at a slow calm rate. When another team joins, the room count Ticks up with a subtle glow; no list of team names scrolls (clutter, and it's the Display's job).

**Haptics:** One Cascade when the crest completes — *your team now exists.* Then silence until the show starts.

**Emotion:** Pride of ownership ("look at our crest") plus building anticipation. Like holding a ticket as the house lights dim.

---

## B3. Team confirmed / show starting

**Purpose:** The handshake between phone and stage — the moment the player learns the two are connected.

**Layout & Motion:** When the host starts the show, the lobby darkens for a breath, then the crest **snaps to the status strip** (top corner, where it lives all night) while a Statement line lands centre: **"You're in, [team name]."** A beat later: "Round 1 — General Knowledge" in Support as the stage sets. If the Display is simultaneously running its opening titles, the handset's bloom pulses *in time with it* — the first visible proof of synchrony.

**Haptics:** Hit on "You're in" — firm, definitive.

**Emotion:** Connection. *The phone just moved with the room.* This single moment converts "website" into "controller," and everything after inherits its credibility.

---

## B4. Question received (the deal-in)

**Purpose:** Transition the player from social mode to game mode in under two seconds, without startling them.

**Layout:** Stage darkens; a Statement-scale card back — crest-embossed, edge-lit — snaps to centre like a card being dealt. On it: "Question 3" and the category at Support. The card holds for the host's read-out beat, then flips into the live question when the host launches it.

**Hierarchy:** One object. The card *is* the screen.

**Motion:** Deal-in with overshoot and settle; the flip to live question is fast and crisp — a single confident rotation, no 3D theatrics.

**Haptics:** Pulse — one soft heartbeat as the card lands. Players learn this gesture means *pick up your phone.* This is the tap-on-the-shoulder that lets them ignore the phone safely the rest of the time.

**Emotion:** A pleasant jolt of readiness — the feeling of a dealer sliding you cards.

---

## B5. Question live + countdown

**Purpose:** The core gameplay screen. A distracted person must grasp question + options + time remaining in one second, and answer with one thumb.

**Layout (multiple choice):**
- Status strip: crest, round·question index, score — all Whisper.
- Stage zone: the question at Statement scale, max three lines.
- **The timer ring:** a thin luminous ring around the entire screen edge, draining clockwise. Peripheral, ever-present, never occupying layout space. Time is *atmosphere*, not a widget.
- Action zone: answer options as full-width bars, generous height, clear dead space between. Text at Support, left-aligned for fast reading.

**Variants:** *Text/number answers* — Statement-scale glowing entry above the keyboard, one "Lock it in" bar beneath; the timer ring stays visible above the keyboard. Numbers get a large confident numeric pad styled as show hardware, not the OS keypad. *Picture questions* — image fills the stage zone (question at Support above), options unchanged. *Multi Tap* — the six-option grid in the action zone as 2×3 tiles; tapped tiles ignite with edge light and Tick; a "Lock all" bar confirms. In Wipeout questions (Q6–10, host-enabled), the stage carries a visible red-edged glint on the frame — danger is ambient, communicated by light, not by warning text.

**Colour:** Options are raised-stage surfaces with structural borders — *neutral*. No colour states meaning anything until the player acts. Timer ring in white → shifting toward brand purple as it drains. The ring never turns red: red means *incorrect* in this product and nothing else (Bible 🔒). Urgency is expressed by pulse and pace, not by stolen colour.

**Motion:** The question snaps in first, options land a beat later (top-to-bottom, fast stagger) — the reading order enforced by choreography. Then stillness: the only motion is the ring draining.

**The final five seconds:** the ring thickens and pulses; the stage dims slightly so the ring and options brighten by contrast; Pulse haptics beat with each remaining second. The screen holds its breath with the room. No klaxons, no shaking, no red.

**Haptics:** Pulse per second in the last five, only if the player hasn't locked.

**Emotion:** Focus with adrenaline at the edges. The player's world narrows to question and thumb.

---

## B6. Submitting an answer — selection vs commitment

**Purpose:** Make answering feel physical and consequential, and make *changing your mind* possible without accidents.

**Interaction:** One tap selects — the option ignites (edge light, slight lift, Tick), others dim. The action zone reveals a single **"LOCK IT IN"** bar in brand purple. A second tap on the bar commits. Two-stage on purpose: fumbling fingers holding drinks need an undo instant, and the deliberate *lock* gesture is where the drama lives. Tapping a different option before locking simply moves the ignition (Tick), and — honestly signalled — a Whisper line notes "Changing costs your speed bonus" the first time it happens, because the scoring truth should be legible in the moment, not discovered on the leaderboard.

**Speed pressure without recklessness:** the lock bar carries a faint live shimmer of the time-decay bonus draining — the *value of now* made visible. No numbers, just diminishing light.

**Emotion:** The tap is instinct; the lock is commitment. Players should feel the difference in their thumb.

---

## B7. Answer locked

**Purpose:** Absolute, unmistakable confirmation — then calm. The single worst handset failure in a timed game is a player unsure whether their answer registered.

**Layout & Motion:** On lock, the chosen answer snaps to centre stage, everything else falls away, and a **vault-shut** moment plays: the option seals inside a crest-stamped plate, edge light tracing its border once. Statement line: **"LOCKED."** Whisper below: "Answer sealed until the reveal." If time remains, the ring keeps draining quietly around a now-still screen — the player watches others sweat.

**Haptics:** **Lock** — the firm double-knock. This is the handset's signature physical sensation, the one players will describe to friends ("it *thunks* when you lock in"). It must feel like closing an expensive car door.

**Colour:** No green. Locked ≠ correct — the plate is purple/white. Correctness colour is spent only at the reveal (Bible: a colour with a job does no other jobs).

**Emotion:** Certainty, then delicious helplessness. *It's out of my hands now.*

---

## B8. Waiting for the reveal

**Purpose:** Hold tension while returning the player's attention to the room and the host.

**Layout:** The sealed plate shrinks to the stage zone, small and still. One Whisper line: "Answers are in. Eyes up." — then the screen eases into the **Eyes Up** state (A6) as the host works the room. The handset goes dark and quiet *on purpose*: the suspense belongs to the host's voice and the Display.

**Motion:** A single slow tightening of the bloom around the sealed plate, then stillness.

**Haptics:** None. The next thing the hand feels is the reveal itself.

**Emotion:** Suspense shared with the whole room — heads up, hearts rating slightly elevated, phone forgotten in the hand until it strikes.

---

## B9. The reveal — correct

**Purpose:** Deliver the night's most repeated emotional payoff, privately and physically, a half-beat *after* the Display reveals to the room — the phone confirms the stage, never scoops it.

**Layout & Motion:** The dark Eyes Up screen **ignites green**: the sealed plate bursts open, the answer text glows green-edged, and a Statement word lands — **"CORRECT."** A green light-sweep crosses the screen once. Peak within a second, fully settled within two (Bible: celebrations are brief; there are 30+ of these per night and confetti here would bankrupt the podium).

**Haptics:** **Hit**, then a short **Cascade**. The correct-answer feeling in the hand — strike then sparkle — should become physically addictive.

**Colour/Type:** Green spent *only* here, at full intensity against near-black. "CORRECT" in white; the green does the talking.

**Emotion:** A private jolt of triumph in the palm while the room reacts around you — the phone and the roar arriving together.

---

## B10. The reveal — incorrect

**Purpose:** Land the truth quickly, kindly, and with the player's dignity fully intact — then pivot their attention forward. Most answers all night are wrong ones; this screen decides whether losing players keep loving the product.

**Layout & Motion:** The plate opens without fanfare. The player's answer settles, marked with a brief red edge — then immediately recedes as **the correct answer takes the Statement position in white**. The screen's message is not "you failed"; it is "here's the answer." Red appears for under a second and only as an edge, never a full-screen wash, never a shake, never a sad character. A Whisper line varies (variation pool): "Round's long. Stay in it." / "That one stung — next one's yours."

**Haptics:** One muted **Thud**. Acknowledged, not punished.

**Emotion:** A wince, then a shrug, then forward motion. The player should be looking at the *correct answer* (interesting) rather than their mistake (shameful) within one second.

---

## B11. Points awarded

**Purpose:** Turn scoring into felt reward — and make speed visible, since time-decay is Quiz-It's skill signature.

**Layout & Motion:** After a correct reveal, the points arrive as a count-up at Statement scale: rolling tabular digits, fast then decelerating, glow-pulse on landing (Bible §3.3). Beneath, Support-size, the anatomy of the win: base points + a distinct **speed bonus** line with a small lightning-flash motif. The fastest correct team in the room gets one extra flourish — a white-gold streak across their score and a Whisper: **"Fastest in the room."** (A superlative players will chase all night; see D2.)

If Danger Zone cost points, the deduction lands as the Bible's *drop* — a heavier, shorter downward settle of the score, red-edged for a blink, no count-down theatre. Losing weight, not falling siren.

**Haptics:** Cascade scaled to the moment — longer for bigger scores; a single Thud for deductions.

**Emotion:** Earned. The count-up makes the number feel *paid out*, not displayed.

---

## B12. Leaderboard (handset view)

**Purpose:** Answer the only leaderboard question a player truly has — *"how are WE doing?"* — while the Display tells the room's story.

**Layout:** Not a table. The handset leaderboard is **you-centric**: your crest and rank at Statement scale in centre stage ("4th · 3,250"), with exactly two context rows — the team directly above you (with the points gap: "▲ 2nd needs 120") and the team directly below ("▼ 40 behind you"). Top three shown as a compact medal strip along the stage's upper edge. Nothing scrolls; a full standings list does not exist during play — that's the Display's job, and a scrolling table is a website.

**Motion:** Rank changes animate as *travel*: if you climbed, your crest visibly rises past a departing row with an upward glow trail and a Cascade; if you fell, the new rival row slides calmly into place above you — your crest never animates downward (no-humiliation rule; the world moved, you didn't sink).

**Colour/Type:** Stage palette. Gap numbers in tabular figures. The rank numeral is the biggest thing on the screen.

**Haptics:** Cascade on climbing; nothing on falling.

**Emotion:** Either "we're close — next question matters" or "they're close — defend." Both feelings sell the next round. A mid-table team must always see a *reachable target*, never a hopeless wall.

---

## B13. Power Cards

**Purpose:** Give teams tactical drama that feels like holding real cards — rare, valuable, spendable.

**Layout:** Power Cards live behind a small crest-side tab in the status strip, and are *presented* only at legal moments (between questions, or when the host enables them) — never reachable mid-answer. Invoked, they fan into the action zone as three physical card objects, art-directed like premium playing cards on the dark stage, each in its locked feature colour: **Boost (yellow)**, **Time-Out (blue)**, **Reverse (red)**. Bruno Ace SC is *not* used on them (Bible 🔒 restricts it to wordmark/Spin to Win/Hard Deck titles); the cards carry Inter set with ceremony — caps, spaced, engraved feel.

**Interaction:** Tap a card — it rises from the fan, face large, effect stated in one line ("BOOST — double points on the next question"). The commit is a **hold-to-play**: press and hold as the card charges with light, then it launches upward off the top of the screen — *into the show* — with a Hit. Hold-to-play prevents drink-fumble accidents and makes spending a card feel like a ritual. Played cards leave a dimmed empty slot in the fan: scarcity made visible.

**Motion:** The fan deals in with stagger and settle; the launch is fast with light trail; the Display simultaneously announces the play to the room (the pay-off: your private gesture becomes public theatre).

**Haptics:** Tick on draw, rising Pulse during the hold, Hit on launch.

**Emotion:** Held power. The fan should be so pleasing that teams *debate* before spending — the debate at the table is the entertainment.

---

## B14. Spin to Win (set-piece)

**Purpose:** One team plays; sixty people watch. The handset has two completely different jobs.

**The chosen team's handset:** The phone transforms — stage floods with purple bloom, **SPIN TO WIN** title (Bruno Ace SC — one of its two permitted handset appearances), and a single enormous circular **SPIN** control in the action zone, pulsing softly. Nothing else on screen. The team presses — hold-to-charge (Pulse rising in the hand), release to spin — and *the slot machine on the Display obeys their thumb*. The phone shows only a live spin glow and then the result echo, a half-beat after the Display lands it. The room watches the stage; the team feels the machine in their hand. This is the purest controller moment in the product.

**Everyone else's handset:** Eyes Up state, with one addition — a Whisper line naming the moment: "Spin to Win — [team] is at the wheel." Their phones go quiet so the room becomes an audience.

**Haptics (chosen team):** rising Pulse through the charge, Hit on release, Cascade or Thud with the outcome.

**Emotion:** For the chosen team — spotlight terror and delight, the most photographed moment of their night. For everyone else — genuine spectatorship: proof that Quiz-It is a show, not sixty parallel apps.

---

## B15. The Hard Deck (set-piece)

**Purpose:** Quiz-It's crown-jewel drama, and the handset's most cinematic assignment. The wheel selects one team; they play Higher/Lower with escalating stakes (5/10/20/40), one card swap, and the night's defining choice: **Stick or Gamble**.

**During the wheel spin:** all handsets in Eyes Up; every phone in the room gives a single synchronized Pulse as the wheel slows — sixty phones beating with the drum. The chosen team's phone then ignites with a Hit: **THE HARD DECK** (Bruno Ace SC, second permitted appearance), their crest beneath.

**The chosen team's play screen:** The current card commands centre stage at Statement scale. The action zone holds two half-width monoliths: **HIGHER** and **LOWER** — huge, edge-lit, pressed-state weighted (these were enlarged for a reason; this spec makes them the biggest buttons in the product). The one-time **swap** is a smaller distinct control above them, visually a card-exchange gesture, which dims permanently once spent. The stakes ladder (5·10·20·40) runs up the screen's side, the current rung glowing — the climb made visible.

**Stick or Gamble:** After each correct guess the screen transforms into the decision: two monoliths — **STICK** (bank it: shows the banked number, calm white-gold edge) and **GAMBLE** (shows what the next rung is worth, purple fire edge). Above them, the pot at Statement scale. Both are **hold-to-commit** with rising Pulse — no team loses everything to a slipped thumb, and the held press *is* the drama: the Display mirrors their charging choice so the room watches the hesitation live. A wrong guess or tie collapses the pot with a single heavy Thud and a dignified fall of light — no mockery, and the Whisper line honours the attempt: "Gambled at 40. Respect."

**Everyone else:** Eyes Up with the pot mirrored in Whisper — and one shared haptic: every phone in the room strikes with the reveal of each card. The whole venue *feels* the flip.

**Emotion:** For the chosen team, the closest Quiz-It gets to a casino heartbeat — held breath, sweaty thumb, glory or a beautiful collapse. For the room, communal suspense worth filming.

---

## B16. Round end

**Purpose:** Close the chapter, pay the emotional interim bill, reset social energy.

**Layout & Motion:** "END OF ROUND 2" lands at Statement with a light sweep; then the handset shows the *personal* round receipt: correct count, points earned this round, best moment ("Fastest answer: Q4"), and the you-centric rank module (B12) with round-over-round movement ("▲ up 3 places tonight"). One screen, no scrolling, ten seconds of glory or resolve — then it eases to the intermission idle (C1).

**Haptics:** Cascade if the team climbed this round; a warm single Hit otherwise.

**Emotion:** A breath. Pride or determination, never deflation — the receipt always leads with the best true thing it can say.

---

## B17. Final leaderboard & podium

**Purpose:** The handset's job during the finale is to *surrender the room to the stage* — and give each team one private beat the Display can't.

**Final leaderboard:** Eyes Up as the Display builds the bottom-up reveal. The handset mirrors only one thing, privately: when *your* team's name lands on the big screen, your phone strikes with a Hit and shows your final rank at Statement scale for three seconds, then returns dark. Sixty phones striking one by one, in sync with the stage reveal — a wave of haptics rolling through the room as the leaderboard climbs. No spoilers: the phone never shows a rank the Display hasn't revealed.

**Podium:** Full Eyes Up. The phone stays dark through third and second place. The theatre belongs entirely to the stage (Bible §3.5) — *unless you're about to win.*

---

## B18. Winner celebration

**The winning team's handset:** As gold ignites on the Display, the winners' phones erupt — the only unrestrained handset celebration of the night. Gold light floods the stage (the celebration metal, spent at last), the crest is crowned, **CHAMPIONS** at Statement in white on gold bloom, rising particles (brief, then still — A8 holds even here). A long Cascade — the richest haptic of the night. Then the phone becomes useful: "Get up there — your photo's waiting," steering the team into the winner-photo ritual.

**Everyone else's handset:** After the podium settles, each phone lights softly with its team's own ending — final rank, points, their night's superlative (D2), and a variation-pool sign-off that always points forward: "4th. One Hard Deck away. Next week." The room's nine losing tables each get a *private, generous* curtain call while the winners get the public one.

**Haptics:** Winners — extended Cascade. Everyone — one warm Hit as their summary lands.

**Emotion:** Winners: floodlit. Everyone else: seen, credited, and already plotting a return.

---

## B19. Post-game summary — "Your Night"

**Purpose:** Convert the evening's feelings into memory, sharing, and a rebooking — the last screen is the first advertisement for next week.

**Layout:** One elegant card, crest-crowned: final rank, points, questions answered, fastest answer, longest streak, biggest climb, and the team's earned superlative. Beneath: the **share card** — a composed, non-editable artefact (team name, crest, result, venue, date, wordmark) built to Bible §6.5: no free text, content-safe, beautiful in a feed. One purple action: **"Save & share."** One Whisper line beneath: the venue's next Quiz-It night, if scheduled — "Same tables next Thursday."

**Motion:** The card composes itself piece by piece — stats dealt in like credits rolling — then settles for good. The handset's last motion of the night is stillness.

**Haptics:** A final gentle Hit as the card completes. The phone's goodbye.

**Emotion:** *"That was a great night — and here's proof."* The player pockets the phone having enjoyed using it — the exact sentence this spec exists to earn.

---

# PART C — IDLE, EMPTY, AND FAILURE STATES

## C1. Intermission idle

Between rounds and during host patter: near-black stage, crest small and calm, current rank in Whisper, bloom breathing slowly. No shimmer, no ticker, no engagement bait — the player's attention belongs to their table and the host. The phone is a companion at rest, and it looks expensive at rest. (It also sips battery — A8.)

## C2. Empty and edge states

- **Joined before anything exists:** the lobby (B2) *is* the empty state — never a blank list or "no data."
- **Missed a question entirely:** at reveal, the phone shows the correct answer with a Whisper "No answer this time" — no red, no thud, no scolding. Then straight to the next deal-in.
- **Joined mid-show:** compressed welcome ("You're in — Round 2, Question 4 is live"), dealt straight into the current state. Zero-point teams appear on the leaderboard immediately (identity from the first second).
- **Host pauses the show:** "Your host will be right back" over the idle state — the show's language, never an error's.

## C3. Connection loss

**The one rule: calm honesty, zero panic theatre.** If the phone loses the show, the current screen dims one step and a Whisper-level strip appears at the top edge: **"Reconnecting to the show…"** with a slow purple pulse. No modal, no red banner, no spinner in the centre of the screen, no dead white page. Whatever was on screen stays visible (dimmed) so the player retains context. If the outage crosses ~10 seconds, the strip adds one honest, blame-free line: "Still with you — the show carries on on the big screen." That sentence matters: the *show* never breaks, only this phone's window into it, and the player's eyes are directed where the entertainment actually is.

**Haptics:** none for loss (never punish the innocent); one Tick on quiet recovery.

## C4. Reconnection

Recovery is silent when short (strip dissolves, state refreshes — the player may never know). After a longer gap, one snap-in summary bridges the missed time: "Welcome back — Q6 is live, you're 4th," then the live state. A player returning on a *new tab or after a killed browser* is met by name: **"Welcome back — rejoin as [team]?"** — one tap restores identity, score, and any locked answer. Rejoining must always feel like being waved back to your seat, never like re-registering.

---

# PART D — CROSS-CUTTING SYSTEMS

## D1. Streaks

Streaks are tracked and staged with restraint — this is broadcast confidence, not mobile-game slot-noise. From the third consecutive correct answer, the points screen adds one element: a compact streak flame beside the score with the count ("×3"), warming subtly in intensity as it grows. Streak *milestones* (5, 8, 10) earn a one-line moment on the points screen — "Five straight. [Team] is hot." — and, at the host's option, a callout on the Display (a public superlative the room can react to). A broken streak simply… ends. The flame is absent on the next points screen. No breaking animation, no loss sting — mourning a streak is the player's job, not the interface's.

## D2. Achievements — superlatives, not badges

**A challenge to the brief's "achievements":** badge cabinets, XP bars, and trophy shelves are the fastest route to *childish* — the Bible's first forbidden feeling. Quiz-It instead runs **superlatives**: named, night-scoped honours in the show's voice — *Fastest in the Room · Best Comeback · Hard Deck Braveheart · Perfect Round · Photo Finish (lost a place by <1s)*. Each team earns at most one headline superlative per night, revealed on their post-game card (and available to the host as material during the show). Superlatives are written like television graphics, not game unlocks; they exist so that nine losing tables leave with a *title*, which is the Bible's losers-decide-rebooking economics made concrete.

## D3. Comebacks

The system watches rank deltas across the night and stages the story privately: a team climbing 3+ places sees momentum language on round receipts ("▲ up 5 tonight — the comeback is on"), and the biggest riser earns *Best Comeback*. A team within striking distance late in the show gets the stakes made visible (B12's gap module sharpens: "Podium is 60 points away — two questions left"). Comebacks are Quiz-It's best mid-table retention weapon: the team in 6th must always have a *story*, not just a number.

## D4. Micro-interaction inventory

The small grammar, uniform everywhere: every tappable element has a pressed state with weight (scale-down + edge-light flare + Tick); toggles and holds charge visibly; the crest gives a tiny proud flare when its team is mentioned on the Display; score digits roll, never cut; screens never scroll during timed play; nothing bounces idly, blinks for attention, or begs. Restraint *is* the micro-interaction language — each small motion exists because a state changed, never because time passed.

## D5. Battery-friendly animation (summary of A8 in practice)

Dark idle and Eyes Up states dominate the night's screen-time; celebration particles are budgeted in seconds; the timer ring is the only sustained animation in play, and it is a thin stroke on black; haptics replace continuous visual attention-holding. Target truth: a phone that arrives at 40% battery finishes the show.

---

# PART E — THE EMOTIONAL SCORE

The handset's full arc, as a single line the way a composer would write it:

**Curiosity** (join) → **pride** (crest) → **connection** (the phone moves with the room) → **readiness** (the deal-in pulse) → **focus** (question live) → **commitment** (the lock's thunk) → **shared suspense** (eyes up) → **private triumph / dignified miss** (reveal in the palm) → **reward** (the count-up) → **stakes** (the gap to the next crest) → **held power** (the card fan) → **spotlight or spectatorship** (Spin to Win, Hard Deck) → **breath** (round receipts) → **the wave** (final reveal haptics rolling through the room) → **gold or a generous curtain call** → **proof** ("Your Night," shared).

Every screen above exists to play its note in that line. If a future design decision doesn't serve a note, it doesn't ship.

> The Display makes the room feel like an audience.
> **The handset makes each player feel like a contestant.**
> That is the whole design.

*End of Player Handset Design Specification v1.0.*

