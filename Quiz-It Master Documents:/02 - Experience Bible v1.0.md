# THE QUIZ-IT EXPERIENCE BIBLE

**The permanent design reference for Quiz-It**
Quiz-It · Powered by Mac Entertainment · by Sonya Mac
Version 1.0 · July 2026

---

## HOW TO USE THIS DOCUMENT

Every design decision — every screen, animation, sound, and word — must be justifiable against this document. If a proposed design cannot point to the principle it serves, it doesn't ship. When two principles conflict, the earlier section wins: Brand Philosophy outranks Visual Language, Visual Language outranks any individual screen.

Locked elements (marked 🔒) are settled and not open for redesign: the wordmark, the primary colour, the feature colour system, the round names, and the Bruno Ace SC restriction.

---

# 1. BRAND PHILOSOPHY

## What Quiz-It stands for

**Quiz-It turns a room of strangers into an audience.**

That is the product. Not questions, not scoring, not screens. Competitors sell quiz software; Quiz-It sells the feeling of being *at a show* — the same feeling as sitting in a TV studio audience when the lights go down. Everything in this document exists to protect that feeling.

## The three-word brand

If Quiz-It were a person, it would be a **broadcast producer**: calm under pressure, obsessed with timing, invisible when things go right, and completely in service of the person holding the microphone.

- **Confident** — never busy, never apologetic, never explaining itself twice.
- **Theatrical** — it understands pacing, suspense, and release.
- **Precise** — every element earns its place; nothing is decoration.

## The one-line test

Every screen, sound, and animation must pass this question:

> *"Would this look and feel at home in a live television broadcast?"*

If the answer is "it looks like a website," it fails. If the answer is "it looks like a slide," it fails. If the answer is "it looks like a graphic that a broadcast director would cut to," it passes.

## A challenge to the brief: redefining "luxurious"

The brief asks for "luxurious" and draws on premium casino experiences. I want to sharpen this, because *luxury aesthetics* and *venue reality* pull in opposite directions.

Luxury design language — thin type, low contrast, gold filigree, dark-on-dark subtlety — is built for quiet, controlled environments. Quiz-It lives in loud rooms, on venue TVs of wildly varying quality, viewed at distance by people three drinks in. Boutique-hotel luxury will read as *illegible* from the back of a bar.

The premium quality Quiz-It should chase is not boutique luxury. It is **broadcast confidence** — the premium of a Formula One graphics package or a Champions League title sequence: bold, high-contrast, immaculately timed, expensive-*feeling* because of restraint and polish, not ornament. That is the luxury that survives a busy venue. Wherever this document says "premium," read it as broadcast-grade, never boutique-grade.

## The brand promise, by audience

**To players:** "You're not filling in answers. You're a contestant on a show."
**To hosts:** "You're not running software. You're directing a live broadcast."
**To venues:** "This isn't a quiz night. It's a weekly event people book tables for."

The venue promise is the commercial engine. Venues advertise Quiz-It when Quiz-It gives them something *worth photographing* — a room full of glowing phones, a cinematic screen, a podium moment. Design for the photo a venue's social media manager wants to take.

---

# 2. VISUAL LANGUAGE

## 2.1 The stage metaphor

The entire visual system is built on one metaphor: **a darkened stage with controlled light.**

Backgrounds are deep and dark — not because "dark mode" is fashionable, but because darkness is how theatre works. Darkness makes light meaningful. A question appearing on a dark stage is an *event*; the same question on a white page is a *form field*. The dark stage also solves the venue problem: dark backgrounds hide TV panel quality differences, reduce glare, and make the screen read as entertainment rather than signage.

Light is the currency. Colour, glow, and brightness are spent deliberately, on the one thing that matters right now — and on nothing else.

## 2.2 Colour palette

### The stage (backgrounds and structure)

| Role | Colour | Notes |
|---|---|---|
| Deep stage | `#0A0118` | Near-black with a violet undertone. The base of every screen. Never pure black — pure black is dead; this is *dark with atmosphere*. |
| Raised stage | `#150A2E` | Panels, cards, and surfaces that sit above the stage. |
| Structural line | `#2E1A52` | Borders, dividers, inactive strokes. Visible but quiet. |
| Text primary | `#FFFFFF` | Headlines, questions, scores. |
| Text secondary | `#B9A8D9` | Supporting information. A desaturated lift of the brand purple, so even "grey" text belongs to the family. |

### The brand 🔒

| Role | Colour | Notes |
|---|---|---|
| Quiz-It Purple | `#BE26C1` | The hero. Wordmark ("QUIZ-" in purple, "IT" in white), primary actions, brand moments, ambient glow. |
| Purple bloom | `#BE26C1` at low opacity | The signature atmosphere: soft radial glows behind focal elements. This is how screens feel "lit" rather than "filled." |

### The feature colours 🔒

These carry *meaning*, and meaning must never be diluted. A colour with a job does no other jobs.

| Colour | Meaning | Rule |
|---|---|---|
| Green | Correct | Only ever means correct. Never decorative. |
| Red | Incorrect / Reverse | Only ever means wrong or Reverse. Never used for emphasis, warnings about time, or decoration. |
| Yellow | Boost | Boost moments only. |
| Blue | Time-Out | Time-Out moments only. |
| Purple | Brand | Everything that is "Quiz-It itself." |

**The discipline this buys:** when the screen flashes green, every person in the room understands it in a quarter of a second without reading anything. That is the one-second rule (§5) implemented in colour. The moment green appears on a button that isn't about correctness, that language is broken forever.

### The celebration metal

Victory needs its own material, distinct from the five semantic colours: **champagne gold** (`#E8C36A` family) reserved exclusively for winning — podium, trophies, winner's name, confetti accents. Gold never appears during normal play. Its rarity is what makes the podium feel like a different world. Silver and bronze complete the podium set and appear nowhere else.

### What is banned

No rainbow gradients. No colour-coded categories that add a sixth, seventh, eighth colour to the system. No pastel anything. When in doubt: dark stage, white type, purple light.

## 2.3 Typography

### The system 🔒

**Bruno Ace SC** is ceremonial. It appears on exactly three things: the Quiz-It wordmark, Spin to Win titles, and The Hard Deck titles. This restriction is a feature, not a limitation — Bruno Ace SC appearing means *an event is happening*. The moment it's used for a button label, it stops meaning anything.

**Inter** does everything else. One family, used with enormous confidence in weight and scale rather than variety in typeface.

### The scale philosophy

Quiz-It typography has **three sizes of intent**, and the contrast between them should be almost uncomfortable by web-design standards:

- **Statement** — the question on the Display, the answer reveal, the score on a handset. Huge. Readable from the back of the room. If a designer thinks it's too big, it's nearly right.
- **Support** — team names, point values, timers, option text.
- **Whisper** — metadata, the branding badge, legal lines. Small, quiet, and rare.

There is no fourth size. Screens with six type sizes are business applications; screens with three are broadcasts.

### Rules

- Numbers that change (scores, timers, countdowns) always use tabular (fixed-width) figures so digits never jitter sideways as they count.
- Questions on the Display are set with generous line height and never exceed three lines. A question that needs four lines needs rewriting, not shrinking.
- ALL-CAPS is reserved for short ceremonial labels ("ROUND 2", "TIME'S UP", "WINNER"). Never for sentences.
- No italics anywhere. Italics whisper; Quiz-It doesn't whisper text, it whispers with *size*.

## 2.4 Materials: glass, depth, and light

### Glass — used like glass, not like wallpaper

Frosted-glass surfaces are part of the language, but with a strict rule: **glass is for the layer above the show, never the show itself.** Overlays, the host's control surfaces, a settings sheet sliding over the stage — these can be glass, because glass says "temporary, floating, above." Questions, answers, scores, and leaderboards are never set on heavy blur, because blur costs legibility and legibility is non-negotiable on the Display.

A warning worth recording: blur-heavy glassmorphism is the fastest way to make a 2026 product look like 2024. Use it sparingly and it reads premium; use it everywhere and it reads template.

### Depth

Three layers, no more:

1. **The stage** — background atmosphere (gradient, bloom, subtle motion).
2. **The show** — content: questions, answers, scores. Highest contrast, zero transparency.
3. **The veil** — temporary surfaces above the show (overlays, confirmations). Glass lives here.

Shadows are soft, large, and coloured (violet-black, never grey), used to lift layer 2 off layer 1 — felt rather than seen.

### Lighting

Light behaves like stage lighting:

- **The bloom**: soft radial glow behind the current focal element. Where the bloom is, the audience looks.
- **The dim**: when something new takes focus, everything else drops brightness. Focus is created by *darkening the rest*, not by making the focus louder.
- **Edge light**: a 1px brightened border on active/selected elements — like rim lighting — instead of fills or heavy outlines.

### Texture and gradients

Backgrounds may carry the faintest texture — grain, a slow-moving nebula of purple bloom — so the stage feels alive rather than flat. Gradients only within the same family (deep violet to near-black; purple bloom fading to nothing). Never two-hue gradients. Never gradient text on information.

## 2.5 Spacing, borders, iconography

**Spacing:** generous to the point of extravagance. Empty space is the cheapest premium material there is. The Display in particular should feel like it has one thing on it at any time, floating in space. Cram nothing, ever.

**Borders and radii:** one consistent corner radius family across all three interfaces — soft enough to feel modern, tight enough to avoid toy-like bubbles. Buttons, cards, and panels are visibly the same species everywhere. Hairline borders in structural line colour; the edge-light treatment for anything active.

**Iconography:** minimal, geometric, single-weight line icons, always paired with a label on the Host Dashboard (a performing host never decodes an unlabeled icon under pressure). The Display uses almost no icons — the Display speaks in words, numbers, and light. Player Handset icons are large and unmistakable.

## 2.6 Visual hierarchy — the one-second rule

Every screen in the system is designed around a single question: **"What must a distracted person understand within one second of glancing?"**

That one thing gets the Statement size, the bloom, and the centre. Everything else supports it or gets out of the way. If two elements compete for the one-second glance, the screen is wrong. This rule outranks aesthetic preference every time.

---

# 3. MOTION LANGUAGE

## 3.1 The philosophy: motion is punctuation

Motion in Quiz-It is not decoration — it is **punctuation**. It tells the room what kind of moment this is: a comma (interface feedback), a full stop (a question locking in), an exclamation mark (a reveal), or a standing ovation (the podium).

The corollary: **if everything moves, nothing means anything.** Quiz-It earns its spectacular moments by being disciplined the rest of the time. A static screen with one perfect animation beats a screen where six things pulse.

## 3.2 The signature: snap and settle

Everything in Quiz-It moves the same way, which is what makes three interfaces feel like one product:

- **Arrivals are fast and confident.** Elements enter quickly with slight overshoot and settle — like a stage light snapping on. Nothing fades in apologetically. Nothing drifts in slowly from off-screen.
- **Exits are faster than arrivals.** Leaving elements get out of the way almost instantly. The show never waits for something to finish leaving.
- **Nothing ends abruptly.** Every animation decelerates into its final position. Linear motion is banned — linear reads as mechanical, and Quiz-It is alive.

Interface feedback (taps, toggles, host controls) completes in the blink of an eye. Show moments (reveals, leaderboards) take as long as the *drama* needs — and not a frame longer. The host's pace is the master clock; no animation may ever make the host wait.

## 3.3 Score changes

Scores never *cut* to a new value — they **count**. Rolling digits, fast at first, decelerating into the final number, with a brief glow-pulse on landing. A score counting upward is one of the oldest and most reliable pieces of game-show tension there is; a score that just changes is a spreadsheet updating.

Points *gained* animate visibly (+150 rising and dissolving); points *lost* (Danger Zone) land with a heavier, shorter motion — a drop, not a rise. Gaining feels like light going up; losing feels like weight coming down.

## 3.4 Leaderboards

The leaderboard is not a table. It is **the plot of the show**, and its animation is a narrative device:

- Rows re-order with smooth vertical travel — teams visibly *overtake* each other. The overtake is the drama; never fade out an old order and fade in a new one.
- Reveal from the bottom up. The bottom half arrives quickly (kindly — don't dwell on last place), then pace slows as it climbs. The top three arrive one at a time, with a deliberate pause before first place.
- A team that has climbed carries a brief upward glow; a team that has fallen simply settles, without humiliation effects. Quiz-It celebrates rising; it never mocks falling — the person in last place must still want to come back next week.
- Between reveals, the leaderboard is *still*. A leaderboard that constantly shimmers has nothing to say when it matters.

## 3.5 The podium

The podium is the finale and gets the biggest motion budget of the night:

1. The stage clears and darkens — a held beat of near-black. Silence before the fanfare (see §4).
2. Third place rises into place. Beat.
3. Second place rises. Longer beat — this is the maximum-tension frame of the entire night, and it should hang there a moment longer than feels comfortable.
4. First place rises taller, gold ignites, light blooms, celebration audio hits, and the winning team name appears at Statement scale.

The rhythm — *reveal, breathe, reveal, breathe, explode* — is inherited from every great game show finale, and it works because of the breaths, not the explosions.

## 3.6 Celebrations

Celebrations are **layered, brief, and rationed**:

- **Layered**: light bloom + motion (confetti, rising particles) + audio landing together in one composed hit, not three effects queued up.
- **Brief**: peak within a couple of seconds, fully cleared within a few. The room's cheering is the real celebration; the screen's job is to *trigger* it, then hand the moment back to the host.
- **Rationed**: a small celebration (correct answer flourish) must be visibly smaller than a round-win, which is smaller than the podium. Save the top gear for the end of the night — if every correct answer gets confetti, the podium has nowhere to go.

## 3.7 Suspense motion

Suspense is Quiz-It's most valuable animation, and it is mostly *stillness*:

- **The hold**: before any reveal, a beat where motion stops and the bloom tightens on the sealed answer. Stillness after movement is the strongest attention signal a screen can give.
- **The countdown**: the final seconds of a timer escalate — tightening ring, deepening pulse — the screen holding its breath with the room.
- **The tease**: reveals may approach and pause ("The answer is…" — beat — reveal), but only when the host controls the beat. The software teases on the host's trigger; it never hijacks timing from the performer.

---

# 4. AUDIO PHILOSOPHY

## 4.1 The prime rule: the host is the soundtrack

Quiz-It's audio exists to serve a room where a person is speaking on a microphone. Every sound must answer: *"Does this make the host sound better?"* Audio punctuates the host; it never talks over them, never plays melodies under them uninvited, and never forces them to wait for a sting to finish. There are no voiceovers — the human has the voice.

## 4.2 Silence is the most expensive sound

The most powerful audio moment in Quiz-It is the **engineered silence** before a reveal. Music out, room quietens, a held beat of nothing — then the hit. Silence is what makes the hit land; a product that constantly makes noise has no silence to spend. Rule of thumb: audio marks *changes of state*, never *states*. A ticking timer for 30 straight seconds is wallpaper; a rising pulse in the final five seconds is drama.

## 4.3 The palette

- **The signature**: one short, ownable Quiz-It sting — the sonic logo. Show open, podium, brand moments. Players should eventually recognise Quiz-It from the next room by sound alone.
- **Tension layer**: low, pulsing beds for question-live and countdown states. Felt more than heard; ducked whenever the host speaks.
- **Punctuation**: reveal hits, correct/incorrect marks, overtake whooshes, lock-in clicks. Short, percussive, done.
- **Celebration**: fanfares scaled like the visual celebrations — small, medium, and the podium's full moment (with the victory-song library as the finale's crown).
- **Feature voices**: Spin to Win and The Hard Deck each own a small signature sound-set, as distinctive as their Bruno Ace SC titles. When the Hard Deck audio starts, regulars should feel the mood shift before a single word appears.

## 4.4 Defeating repetition

A weekly product's sounds are heard hundreds of times, and a sound heard hundreds of times becomes either beloved or unbearable. Three defences: **variation pools** (each common event owns a family of takes with subtle differences, randomly drawn — one fixed sound per event is how apps become irritating); **escalation** (later rounds carry slightly bigger versions, so the night crescendos sonically); and **rarity for the rare** (podium and jackpot sounds appear once a night, so they never wear out).

## 4.5 The silent-venue reality

A hard truth to design for: some venues will run the Display with poor audio, competing sport commentary, or no sound at all. Therefore **audio is amplification, never information**. Every state change that has a sound must have an equally strong visual. The show must work perfectly muted — then audio makes it electric.

---

# 5. INTERFACE PRINCIPLES

The laws every screen must follow, across all three interfaces.

**1. The one-second rule.** Any screen, glanced at by a distracted person, communicates its single most important fact within one second. One focal point per screen — if two things compete, the screen is wrong.

**2. One product, three costumes.** Host, Display, and Handset share the same stage darkness, palette, type system, corner radius, motion signature, and audio family. A player glancing from phone to big screen must see the same world at two sizes. The three interfaces differ in *what* they show, never in *who they are*.

**3. The state is always legible.** At any moment, every surface answers "what is happening right now?" without interaction — waiting, question live, time running out, revealing, celebrating. Nobody in a live show should ever wonder whether the thing is working.

**4. Never make the room wait.** No animation, transition, or sound may block the host's next action. Spectacle yields to pace, always. A dead screen while something loads is a dead room; every transition covers its own gaps.

**5. Information is prioritised by emotion, not by data.** The question is bigger than the timer. The winner is bigger than the score. What the room *cares about* gets the size — not what the database finds important.

**6. Feedback is instant and physical.** Every touch on the Handset and every control on the Host Dashboard responds visibly within a blink — press states, weight, response. Waiting to find out whether a tap registered is the fastest way to make a product feel broken, and in a timed game it's fatal.

**7. Nothing looks like a website.** No underlined links, no form-styled inputs, no breadcrumbs, no cookie-banner energy, no browser-default anything. Text entry (team names, text answers) is styled as *part of the show* — a big, glowing, centred moment — not a field with a label.

**8. Design for the fumble.** Big touch targets, forgiving spacing, confirmation only for destructive acts, and graceful recovery everywhere. Players are holding drinks; hosts are holding a microphone and a room. Precision is the designer's job, not the user's.

**9. The brand signs its work, quietly.** The wordmark and "Powered by Mac Entertainment" badge are present with whisper-level hierarchy on all three surfaces — a signature in the corner of the painting, never a watermark across it.

**10. Everything is content-safe for the room.** Every visual, sound, and written word must suit a mixed international audience in a UAE venue. This is a design constraint with no exceptions and no edgy branding moments.

---

# 6. ENTERTAINMENT PRINCIPLES

## 6.1 The reframe: Quiz-It is a show that contains a quiz

A quiz asks questions and tallies answers. A show has an opening, rising stakes, set-pieces, a climax, and a curtain call. Quiz-It's fixed round structure is already a show rundown:

- **Cold open** — arrival, join, atmosphere building on the Display.
- **Act One** — General Knowledge: establish the game, let teams find their feet.
- **Set-piece** — Spin to Win: one team, one moment, whole room watching.
- **Act Two** — stakes rise; Danger Zone raises the cost of guessing.
- **The showdown** — The Hard Deck: Quiz-It's signature drama (see 6.3).
- **Finale** — leaderboard climax, podium, celebration, curtain.

Design every screen knowing *where in the show* it sits. A Round 1 screen and a final-round screen can be structurally identical yet feel different — darker stage, tighter light, heavier audio — because the *night* has escalated.

## 6.2 The mechanics of suspense

Suspense is information management: the answer exists, the room doesn't have it, and the gap is held deliberately.

- **The gap is the host's.** Software creates the *conditions* (sealed answers, held leaderboards, paused reveals) and the host chooses when to release. Auto-revealing on a timer throws away the most valuable seconds of the night.
- **Reveal in the tension order.** Bottom-up leaderboards, third-second-first podiums, "let's see who got this…" before names appear. Always order information so the most-wanted piece lands last.
- **Show the stakes before the moment.** "Whoever gets this jumps to second place" turns an ordinary question into an event. Surfaces should make stakes visible — gaps between teams, what a Gamble would win or lose on the Hard Deck — because known stakes are what turn watching into caring.
- **Near-misses are gold.** "You were 0.3 seconds behind" or "one point off the podium" hurts wonderfully and guarantees a return visit. Where the data allows the show to say *how close it was*, say it.

## 6.3 Signature moments — the story people tell tomorrow

People don't remember evenings; they remember *moments*. Quiz-It manufactures them deliberately:

- **The Hard Deck is the crown jewel.** One team, spotlight, escalating stakes, and the purest drama in the format: **Stick or Gamble**. Give that decision the full treatment — the room sees the choice, the potential gain, the potential loss, and a held silence while the team decides. This is Quiz-It's Millionaire moment: the pause *is* the product.
- **Spin to Win is the lottery moment** — earned by speed, decided by chance, impossible to look away from.
- **The winner's photo moment** already exists in the product and should be treated as a finale ritual: gold frame, wordmark, podium graphics — composed so it's worth posting (see 6.5).
- **Manufacture one "did that just happen?" per night.** Fast Track catapulting a team to first, a dramatic overtake called out on screen, a last-question flip of the leaderboard. The system should notice these swings and give them presentation weight.

## 6.4 Engineering applause

Applause is a coordination problem: everyone must know *when*. The screen's job is to make the moment unambiguous — a reveal that lands with a hit and a light bloom is a room-wide cue that *this is the moment*, and the host rides it. Applause triggers to protect: every reveal, every overtake into the top three, the Stick-or-Gamble resolution, each podium step. If the screen dribbles information out gradually, there is no moment, and there is no applause.

## 6.5 Social sharing

Nobody shares a screenshot of software; people share **evidence of a great night**. Three shareable artefacts, all composed (never free-text, keeping them content-safe):

1. **The winner's card** — team name, podium position, venue, date, wordmark. The trophy they didn't get to keep.
2. **The moment card** — "Fastest answer of the night", "Hard Deck: gambled and won". Superlatives beyond winning, so more than one table has something to post.
3. **The room itself** — the podium screen and celebration lighting designed to look spectacular *in a phone photo of the venue*. When the room looks like an event, guests do the marketing unprompted.

## 6.6 Designing the emotional journey — including for losers

The brief's emotional arc (arrival → curiosity → excitement → competition → suspense → victory → celebration → sharing) is right, with one hard commercial amendment: **victory happens to one table; the other nine tables' emotional journey decides whether the venue rebooks.**

The show must pay everyone: near-miss drama for the mid-table, superlative moments (fastest finger, best comeback, Hard Deck bravery) scattered beyond the winners, a leaderboard that never humiliates, and set-pieces where any team can be pulled into the spotlight regardless of rank. The measure of a great night is not "the winners were happy" — it's "the team that came seventh is already planning next week."

---

# 7. THE THREE EXPERIENCES

One show, three roles: the **director's console**, the **stage**, and the **controller**. Identical DNA, completely different temperaments.

## 7.1 Host Dashboard — the director's console

**Personality: calm authority.** *Mission control, not the fireworks.*

A challenge to the brief here: the Host Dashboard should feel like controlling a live broadcast, but it must not *itself* be cinematic. In a real broadcast gallery, the drama is on the programme monitor — the director's desk is calm, dense, and ruthlessly legible, because the person using it is doing three jobs at once. Any animation that delays a host's tap, any beauty that costs a glance, makes the show worse. The host's spectacle is *the room responding*, not their own screen.

So the Host Dashboard is the quietest, most confident surface in the family: dark stage, minimal motion, whisper-level chrome — and absolute clarity about three things at all times: **what the room is seeing now, what happens when I press the big button, and what's coming next.** One primary action dominates at every phase ("Reveal Answer", "Next Question", "Start the Hard Deck") — the host should be able to run the entire show with a thumb while never taking their eyes off the audience. Dangerous actions live physically away from frequent ones. Live information the host narrates from — answers arriving, fastest team, current standings — is presented as *performance material*, formatted to be read aloud mid-sentence.

The premium feeling for hosts is **trust**: after three shows, the dashboard should feel like a instrument they play without looking.

## 7.2 Display Screen — the stage

**Personality: the star.** *A television channel, not a monitor.*

The Display gets the entire theatrical budget: the boldest type, the bloom, the motion set-pieces, the audio moments. It is designed for a viewer who is 10 metres away, mid-conversation, holding a drink — which means: one focal point, Statement-scale type, high contrast, and no element that requires more than a glance to parse.

The Display is **never blank and never busy**. Between moments it breathes — ambient stage light, the wordmark, gentle leaderboard presence — like a broadcast holding shot, so the room always has somewhere to look. During moments it commits totally: question mode is all question; reveal mode is all reveal. The Display shows *the show*, never its machinery — no controls, no states-of-the-software, no interface furniture. If a passer-by glances at it, they should think "what's happening here?" — not "that screen is a menu."

## 7.3 Player Handset — the controller

**Personality: alive in your hands.** *A game controller, not a form.*

The Handset's job is to make every player feel *connected to the show* — that the big screen and their phone are one machine and their thumb is wired into it. Everything fits on one screen with no scrolling during play; answer targets are huge; every touch responds instantly with light and weight. When the Display counts down, the Handset counts down; when the room celebrates, the phone celebrates in the player's palm. That synchrony — the phone and stage breathing together — is what makes it feel like a controller rather than a website.

The Handset is also where private drama lives: *your* answer locking in, *your* points counting up, *your* team's rank rising. The big screen tells the room's story; the phone tells *yours*. One refinement on "no scrolling": the true rule is **no scrolling while the clock runs**. If a rare state genuinely needs more space (long rules, join details), it may exist outside timed play — but during any live question, everything a player can do fits under their thumb, no exceptions.

Feedback discipline: instant acknowledgment ("answer locked") is always shown; *correctness* is revealed on the show's schedule, not the phone's. The phone never spoils the stage.

---

# 8. THE PREMIUM STANDARD

What separates good, excellent, and world-class — so "premium" is a measurable bar, not a mood.

## Good (the competitor's ceiling)

Works reliably. Looks modern. Questions display, answers score, leaderboards update. Venues would call it "a solid quiz system." **This is where SpeedQuizzing and Kahoot live, and it is not enough.** Good is table stakes; nobody advertises good.

## Excellent

Every screen passes the one-second rule. Motion follows one signature everywhere. Audio punctuates instead of filling. The three surfaces are unmistakably one product. Reveals create audible room reactions. Hosts say it makes them better at their job. Venues notice tables are staying longer. Excellent is a product with *taste* — coherent, confident, polished. Most premium software never gets past excellent.

## World-class

World-class is not more polish — it is a different relationship with the room:

- **The product has moments people describe to friends the next day**, by name: "then the Hard Deck happened."
- **The room behaves differently.** People applaud a screen. Strangers watch a team they've never met decide to Gamble. Phones come out to film the podium — unprompted.
- **The host performs above their own level.** An average host with Quiz-It runs a visibly better show than a great host with anything else. The product is a stage that makes performers.
- **Nothing can be pointed at.** Ask a player what made it feel premium and they can't say — no single feature, just "the whole thing." World-class is when the craft disappears into the feeling.
- **Venues sell it by name.** The poster doesn't say "Quiz Night." It says **Quiz-It**, because the name itself pulls a crowd.

The test for every future design review, in one line:

> **Good works. Excellent impresses. World-class gets applause.**
> Every screen in Quiz-It is aiming for the third.

---

## APPENDIX: LOCKED DECISIONS REGISTER 🔒

- Wordmark: "QUIZ-" `#BE26C1` + "IT" white. Tagline: "Quiz-It · Powered by Mac Entertainment · by Sonya Mac".
- Bruno Ace SC: wordmark, Spin to Win titles, Hard Deck titles only. Inter for all other text.
- Feature colours: Purple = brand · Yellow = Boost · Blue = Time-Out · Red = Reverse/incorrect · Green = correct. (This bible adds: Gold = victory only.)
- Names: "The Hard Deck", "Danger Zone", "Wipeout Mode", "Multi Tap", "Spin to Win" — as defined; retired names are never reused.
- Content: all material suitable for a mixed international UAE audience, without exception.

*End of Experience Bible v1.0 — the reference against which every Quiz-It screen will now be designed.*
