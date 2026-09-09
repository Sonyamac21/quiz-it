# Question Quality & Acceptance Rules

Owner: Claude (content/product spec). Consumed by: Codex (encodes into AI-generation
prompts, validators, and regression tests). This document defines what "good" means
for every question type and round format Quiz-It supports, in terms specific enough
to be checked programmatically — not just described.

Every rule below is written so it can become either (a) a validator that runs before
a generated question is allowed into a round, or (b) a regression test case. These
requirements are a starting specification, not a final one — they are subject to
validation against the approved gameplay rules already implemented in
`lib/quiz/answerScoring.ts` and `app/host/quiz/page.tsx`, and against the current
database model, before Codex encodes any threshold into a hard validator or test. If
this document and the live scoring code ever disagree, treat that as a discrepancy to
resolve explicitly (raise it back to this doc), not as license to pick either side
silently.

---

## 1. Cross-cutting rules (apply to every question type)

1. **No duplicate correct answers within a round.** Two questions in the same round
   must not share a normalised correct answer (case-insensitive, punctuation-stripped,
   leading-article-stripped — reuse the existing `normaliseAnswerText()` logic in
   `lib/quiz/answerScoring.ts` as the dedupe key).
2. **No duplicate subject within a round.** Two questions in the same round must not
   test the same specific fact/entity (e.g. two different questions both keyed on
   "the Eiffel Tower"), even if the correct answers differ.
3. **Theme relevance, if a theme is set.** When a round has a theme, every question's
   subject must be identifiable by a human reviewer as belonging to that theme without
   requiring the correct answer to be read first. A question that is only tangentially
   themed ("What year did X happen" where X is barely theme-adjacent) must be rejected.
4. **No date-sensitive claims without a fixed reference point.** A question must not
   assert something true only "currently" or "as of now" (e.g. record holders,
   youngest/oldest living X, current job-title holders) unless the question text itself
   pins the claim to a specific year or event, since the same question may be replayed
   months or years later.
5. **Answer must be unambiguous.** If a reasonable adult, without access to the
   question's stored correct answer, could defensibly give a different but equally
   correct answer, the question is rejected unless that alternative is captured as an
   accepted variant (see §14).
6. **No compound/multi-part questions** disguised as a single question (e.g. "Name the
   capital of France and the year the Eiffel Tower was built") unless the round type
   explicitly supports multi-part scoring (Multi Tap, Sequence).
7. **Question text length**: a single question must be answerable by a team reading it
   once, in the time budget for its type (see `lib/quiz/questionTimer.ts`). Reject
   anything requiring a second read-through to parse.

---

## 2. Multiple Choice

**Generation rules**
- Exactly one correct option; the other 2–5 options must each be independently
  plausible as a guess to someone who doesn't know the answer, not filler.
- No option may be a subset/superset or rewording of another option in the same
  question (e.g. "Paris" and "Paris, France" as separate options).
- Options must be roughly the same length/specificity — a correct answer that's
  visibly longer, shorter, or more specific than the distractors is a known
  "guess the odd one out" tell and must be rejected.

**Rejection triggers**
- Any option that is factually also correct (multiple valid answers for a
  single-answer question type).
- "All of the above" / "None of the above" as an option.
- A distractor that's absurd/joke-tier rather than plausible (reduces effective
  difficulty to a coin-flip against 3 real options).

---

## 3. Text Answer / Number

**Generation rules**
- The correct answer must be a single word, short phrase, or number — not a sentence.
- For Number questions: the question must make clear the expected unit and precision
  (e.g. "to the nearest year," "in miles") if the answer isn't self-evidently a bare
  integer.

**Rejection triggers**
- An answer that has more than one common spelling/format without those variants being
  captured (see §14) — e.g. a name with a common alternate spelling, a measurement that
  could reasonably be answered in more than one unit.
- A Number question whose "correct" value is itself disputed or rounds differently
  depending on source (reject unless the question specifies the source/rounding).

---

## 4. Sequence

**Generation rules**
- Exactly 4 items with one unambiguous correct order (chronological, size, ranking,
  etc.) — the ordering principle must be stated or obvious from the question text.
- No two items may be adjacent-order-ambiguous (i.e. a case where sources disagree on
  which of two items comes first) — if the ordering of any pair is contested, reject.

**Rejection triggers**
- An ordering principle that depends on a value close enough between two items that
  reasonable teams could transpose them without being "wrong" in spirit (e.g. two
  historical events in the same year, ordered by month, when the question doesn't
  specify a resolution finer than "year").

**Scoring note (for Codex):** sequence correctness must be evaluated against the
semantic order of the item content, not the on-screen option letter — see
acceptance scenario A1.

---

## 5. Picture

**Generation rules**
- The image must be resolvable to a single, unambiguous subject a team could name from
  the image alone, without the question text doing the identifying work for them
  (a picture question where the caption already gives away the answer is void).
- Reject generic/interchangeable phrasing as the question text (e.g. "What animal is
  this?" for a photo that could be dozens of visually similar species) unless the
  image itself narrows it to one defensible answer.
- Image must be durably hosted (not a hotlinked third-party URL) before the question
  is considered "ready" — see the existing `persistPixabayImage.ts` pipeline.

**Rejection triggers**
- Any image that fails to load, is watermarked, or is low-resolution enough to be
  illegible on a TV screen at typical venue viewing distance.
- A caption/question text that makes the image redundant (the team could answer
  correctly with the image blacked out).

---

## 6. Music / Audio

**Generation rules**
- Track must be licensed for the public performance/venue-playback context Quiz-It is
  used in (see the separate sound-asset licensing audit Codex owns — this rule exists
  so generation doesn't introduce new unlicensed tracks going forward).
- The clip start point must land on a recognisable, unambiguous section of the
  track (not silence, not an atypical intro/outro) so the round is fair regardless of
  a team's familiarity with the song's structure.

**Rejection triggers**
- A track where the "correct answer" (song/artist) is disputed (covers, samples,
  multiple credited artists) unless the question specifies which credit is being
  asked for.

---

## 7. Multi Tap

**Generation rules**
- A question may have between **1 and 6 correct options** out of up to 6 total. A
  10-question Multi Tap round must include a mix of correct-answer counts across that
  1–6 range — **no more than two questions in a round of ten may have exactly one
  correct answer.** A question is not "Multi Tap" merely because five false
  distractors were added to an otherwise single-answer fact; the round must contain
  genuine multi-answer questions (e.g. "which of these are EU member states") where
  the count of correct options is itself part of the challenge.
- All-6-correct questions are permitted (there is no answer-count ceiling below 6) but
  should be used sparingly — no more than one per round — since a question with no
  incorrect options to identify is a weaker test of the tap-all-that-apply mechanic
  than one with a genuine correct/incorrect split.
- Every option (correct and incorrect) must be independently, unambiguously
  classifiable as correct/incorrect — no option where correctness depends on
  interpretation.
- State the selection criterion explicitly in the question text (e.g. "Tap all the
  countries that..." not just "Tap the correct answers").

**Rejection triggers**
- A question with zero correct options (removes the point of tapping entirely).
- Any option whose correct/incorrect status is genuinely debatable.

**Scoring note (for Codex):** Multi Tap does **not** use exact-match binary scoring.
Live scoring (`autoScore()`, multi_tap branch, `app/host/quiz/page.tsx`) awards
**2 points for every option judged correctly** — that includes both a true option the
team correctly tapped AND a false option the team correctly left untapped — plus up
to 4 time-bonus points, all doubled under Boost, and zeroed entirely under Wipeout
Mode if any team tapped a wrong option that question. `isAnswerCorrect()` in
`lib/quiz/answerScoring.ts` is a separate, stricter binary all-or-nothing check used
only for the `correct_count` stat and reveal colouring — it is not the scoring
formula. See acceptance scenario A3.

---

## 8. Nearest Wins

**Generation rules**
- The target value must be a specific, verifiable number as of a stated reference
  point (see cross-cutting rule 4).
- The question must not hint at rounding or an approximate answer — teams should be
  estimating a precise figure, not guessing a range.
- Avoid targets where the "correct" figure is itself contested between sources by more
  than a trivial margin.

**Rejection triggers**
- A target value with no single authoritative source.
- A question phrased in a way that suggests an answer format (e.g. "roughly how
  many...") — Nearest Wins questions ask for a specific guess, not an estimate range.

---

## 9. Hot Seat

**Generation rules**
- Questions must be answerable within the buzz-in/claim window without requiring
  the claiming team to read a long passage first — favour short, punchy questions.
- Avoid questions where knowing the general topic gives away the answer before the
  full question is heard (protects the "race to claim" mechanic's fairness).

**Rejection triggers**
- A question whose difficulty is heavily dependent on hearing the entire question
  (defeats the purpose of a fast buzz-in format).

---

## 10. Hard Deck

**Generation rules**
- Question difficulty should scale with the deck's point ladder (10/20/40/60/100) —
  low-value cards should be genuinely easier than high-value cards, verified by
  difficulty-confidence tagging (see §11), not just labelled that way.

**Rejection triggers**
- A 100-point question that's trivially easy, or a 10-point question that's genuinely
  obscure — difficulty must be internally consistent with the point value shown to
  players before they gamble on it.

---

## 11. Pursuit

**Generation rules**
- Each category/subject-track in Pursuit must have internally consistent difficulty
  across its own questions (a team choosing "Sport" should face comparable difficulty
  question-to-question within that track).
- Avoid overlapping subject matter between tracks in the same Pursuit round (protects
  meaningful category choice).

**Rejection triggers**
- A track where questions vary wildly in difficulty, undermining the category-choice
  strategy the round is built around.

---

## 12. Bonus Rounds

**Generation rules**
- Every question in a themed Bonus round must pass the theme-relevance rule (§1.3)
  strictly — Bonus rounds are the round type most likely to be perceived as
  "off-theme" if generation drifts, since the theme is the entire draw.
- Regeneration of a single Bonus-round question must reuse the round's already-set
  theme/difficulty, never fall back to a generic/untargeted prompt.

**Rejection triggers**
- Any question in a themed Bonus round that a reviewer cannot connect to the stated
  theme within a few seconds of reading it.

---

## 13. Difficulty & subject distribution (per standard 10-question round)

- No more than 3 of 10 questions may share the same broad subject category (e.g.
  Geography, Sport, Music, History, Science, Pop Culture) — enforce spread.
- Difficulty should roughly follow: 3 easy, 4 medium, 3 hard, unless the round is
  explicitly flagged as a themed/specialist round where the host has opted into a
  different curve.
- No round may open (question 1) or close (final question) on the hardest difficulty
  tier — question 1 should be gettable by most teams to build early confidence;
  the closer should be memorable but not so obscure it feels unfair.

---

## 14. Required answer alternatives (§7 referenced above)

For any question type where more than one phrasing of the correct answer is
reasonably common, generation must populate accepted alternatives rather than relying
solely on fuzzy-match scoring at answer time. Examples of when this is required:
- Names with common alternate spellings/transliterations.
- Measurements answerable in more than one common unit.
- Answers commonly given with or without a title/prefix ("the Beatles" / "Beatles").

This is a generation-time responsibility (populate the alternatives) even though the
actual fuzzy-matching at scoring time is Codex's responsibility (`isFuzzyMatch()` in
`lib/quiz/answerScoring.ts`).

---

## 14a. Open items to verify before implementation

Raised during review — recorded here rather than silently assumed either way:

- **Nearest Wins tie-break.** Checked against the live code
  (`app/host/quiz/page.tsx`, `autoScore()`): ties on distance are deliberately broken
  by earliest submission, not equal placing/points — this is an explicit design
  decision per the existing comment ("Ties on distance go to whoever submitted first,
  same convention as the speed bonus above"), not an accident. Flagging here so it's
  a confirmed decision rather than an assumption: if equal placing is actually
  preferred, that's a deliberate rule change, not a bug fix.
- **Library question delete vs. rounds already using it.** Checked against the live
  code: deleting a `question_bank` row only removes that library row
  (`.from("question_bank").delete().eq("id", bankQ.id)`); a round's questions are
  stored as their own embedded copy on the round record, not a live foreign-key
  reference back to the bank. So the confirmation copy in
  `terminology-and-host-copy.md` §4 ("will not affect rounds where it's already been
  used tonight") appears accurate from a code read, but hasn't been exercised as a
  live test — Codex should add this as an explicit acceptance case rather than trust
  the read alone.
- **"Handset" vs. "Your phone."** Open — a genuine wording call, not a correctness
  question. "Handset" is precise and already used consistently in code/host-facing
  copy; "Your phone" may read as warmer/clearer to players. Recommend keeping
  "Handset" in host-facing and internal copy (where precision matters and the host
  may not be looking at a phone at all) and trialling "Your phone" specifically in
  player-facing copy only, rather than a global rename — happy to mock up both for
  a call rather than assume.

## 15. Acceptance scenarios

These are concrete, rehearsable test cases — not abstract requirements — written so
Codex can translate each directly into an automated test. Each describes a specific
situation and the required outcome.

**A1 — Sequence, option-order independence.**
Three teams answer a Sequence question with four items. The options are displayed in
a different randomised order on each team's handset. Two teams select the items in the
correct semantic order (regardless of which on-screen letter that order corresponds to
on their own handset); the third team selects a different order. Required outcome:
the two teams who chose the correct semantic order are marked correct, independent of
which letters they tapped; the third team is marked incorrect. The system must never
compare submitted letter-keys directly across teams — only the semantic content those
keys resolve to.

**A2 — Multiple Choice, letter vs. text storage.**
A question's correct answer is stored as a letter key (`"b"`) in one case and as the
literal option text ("SZA") in another (mirroring real imported-data variance). A team
submits the letter their handset assigned to the correct option in both cases.
Required outcome: both are marked correct, regardless of which storage format the
question happens to use.

**A3 — Multi Tap, per-option partial credit.**
A Multi Tap question has 3 correct options out of 6 (3 correct, 3 incorrect). A team
taps 2 of the 3 correct options, taps none of the incorrect options, and leaves 1
correct option untapped. Required outcome: the team is awarded 2 points for each
option judged correctly — the 2 correct options they tapped, plus the 3 incorrect
options they correctly left untapped — for a base total of 5 x 2 = 10 points (before
any time bonus or Boost multiplier), NOT zero and NOT full marks. This is a genuine
partial-credit, per-option scoring model, distinct from the separate all-or-nothing
`isAnswerCorrect()` check, which is used only to set the `correct_count` stat and
reveal colouring, not to determine points. Confirm this scenario continues to hold
after any future refactor of `autoScore()`'s multi_tap branch.

**A4 — Nearest Wins, tie-break by submission time.**
Two teams submit numeric guesses equally distant from the target value. Required
outcome: the team whose answer was submitted earlier is ranked first (full points);
the later team receives the second-place tapered percentage, not a tie/split.

**A5 — Duplicate submission, exactly-once scoring.**
A team's handset submits the same answer twice in quick succession (e.g. a
double-tap or a retried network request). Required outcome: the team is scored
exactly once for that question — the second submission must not double the point
award, verified via the `event_key` idempotency mechanism in `apply_score_delta`.

**A6 — Reconnection mid-question does not lose or duplicate a submission.**
A team submits an answer, then their handset briefly disconnects and reconnects
before the question closes. Required outcome: exactly one scored submission exists
for that team for that question — reconnecting must not clear their submitted answer
nor allow a second, different answer to silently overwrite the first after the
question has already been scored.

**A7 — Round-scoped theme persists through regeneration.**
A themed Bonus round ("Food & Drink") has one question regenerated by the host mid-
build. Required outcome: the regenerated question is on-theme for "Food & Drink" —
regeneration must read the round's already-set theme, not fall back to an untargeted
prompt (this was a real bug, already fixed, that this scenario exists to protect
against regressing).

**A8 — Library question can't be double-selected into the same round.**
A host adds a question from the library to a round, then opens "random from library"
again for the same round. Required outcome: the already-added question is excluded
from the random pool and does not appear as a duplicate option.

**A9 — Rejected library question does not resurface immediately.**
A host rejects a randomly-pulled library question and requests another. Required
outcome: the rejected question does not reappear in the same session's pulls for that
round (this was a real bug, already fixed, that this scenario exists to protect
against regressing).

**A10 — Fifty simulated teams, one question, one scoring pass.**
Fifty teams submit answers to the same question within a few seconds of each other.
Required outcome: every team receives exactly one score update, the leaderboard
reflects all fifty afterward, and no submission is dropped or duplicated under load.
