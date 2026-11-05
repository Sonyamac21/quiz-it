# Generation workflow audit — 5 November 2026

## Production checks

- Used the signed-in production Quiz Plans interface for the existing
  “Porters 5th Nov” plan, requesting exactly one new question for Regular
  Round 2. The deployed generator completed and confirmed ten saved questions.
  The accepted question asks which Baltic country's capital is Riga; Latvia
  is the keyed answer. This was a real AI generation and database save,
  not a mocked response. No additional test quiz or full regeneration ran.
- Multi Tap already contained ten saved questions and showed Ready.
- Inspected Pursuit's remaining blocker: a Number question stored “1960 Rome”.
  Corrected the question to ask explicitly for the year of the first
  Paralympic Games in Rome, stored `1960`, and removed the answer-revealing
  hint. The production interface then showed Pursuit Ready.
  Source: https://www.paralympic.org/ipc/history
- Corrected three other Pursuit explanations/wordings encountered during
  inspection: Concorde's commercial service began in 1976 (not its 1969
  first-flight date); One Direction's five-member question now specifies
  its original 2010 line-up; the golf question explicitly concerns men's
  traditional majors and removes a false statement that Nicklaus' record
  ended in 2022.
  Sources: https://corporate.airfrance.com/en/news/air-france-commemorates-50th-anniversary-concordes-first-commercial-flight
  https://www.guinnessworldrecords.com/news/2012/9/one-direction-getting-in-guinness-world-records-book-is-a-dream-44682
  https://www.theopen.com/players/jack-nicklaus
- Two music questions still need saved clips. Those are content-preparation
  requirements, not a failed generation or a reason to regenerate the rounds.

## Workflow changes

- All-time history is still checked across library, bank, standalone rounds
  and saved quiz plans. History reads use bounded groups of four 500-row
  pages instead of sequential reads, with a timeout on each request.
  History errors stop generation rather than disabling duplicate protection.
  Repeated rows across sources are deduplicated in memory.
- History progress is shown before AI generation starts. Old generation
  warnings are cleared when a new per-round run begins.
- Generated Number and multiple-choice questions receive structural checks
  before paid quality validation. Grouped numeric strings are normalised;
  answers containing units/place names, blank answers, missing/duplicate
  options and invalid multiple-choice keys are rejected early.
- Bulk and per-round generation use the same save helper. It reads the latest
  round, compares before writing and retries competing edits. Failed reads
  never fall back to an old screen snapshot. Existing questions and clips are
  preserved, repeated saves are idempotent and a marked brain teaser stays last.
- Unsaved generated questions are retained in browser storage. A save-only
  recovery action does not make AI calls. New generation is blocked while
  retained questions await saving.
- Manual Multi Tap editing toggles several correct letters instead of
  replacing the key with one letter. Sequence editing exposes the complete
  order rather than a single-choice control. Manual edits receive structural
  validation and save against the latest round without discarding clips or
  other concurrent questions. Number cards only display the actual hint
  field, never leftover distractors from a malformed prior generation.
- Patched Next.js and eslint-config-next to 16.4.5, Blob SDK to 2.8.2, and
  compatible undici/Zod transitive versions. Production npm audit: zero
  reported vulnerabilities. Development-tool advisories remain separate.

## Limits

The completed automated suite contains 241 passing tests. TypeScript passes.

Automated tests cover history pagination/failures, concurrent saves, retained
question idempotency, final-question position and output formatting alongside
the existing suite. AI factual accuracy cannot be guaranteed by these tests.
The live top-up verifies one production path; it is not evidence that every
theme, provider or complete quiz will always succeed. No new real-phone live
session rehearsal was performed in this audit.
