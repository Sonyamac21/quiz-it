# Question Library — Information Architecture Specification

Owner: Claude (product spec). Consumed by: Codex (implementation) and Claude
(contained, non-gameplay UI work — see the standing ownership agreement in
`docs/product/question-quality-and-acceptance.md`'s framing). This document
specifies the target structure for the Question Library screen
(`app/host/question-bank/page.tsx`) — what exists today is noted inline so this reads
as a delta, not a rewrite from nothing.

This is a specification of structure, labels and flows, not code. Screenshots/visual
polish are covered separately in the platform review; this document is about
information architecture — what's filterable, how questions are grouped, what state
a question can be in, and exactly what every button says and does.

---

## 1. Current state (baseline, for reference)

Already implemented and working, listed so the rest of this doc reads as additions
rather than duplicating what exists:
- Type filter chips (All questions / Multiple Choice / Multi Tap / Text Answer /
  Number / Nearest Wins / Sequence / Picture / Music).
- Topic filter chips (Sport, Geography, History, Science & Nature, Music, Film & TV,
  Literature & Language, Food & Drink, General Knowledge, Current Affairs,
  Art & Culture).
- Review-mode toggle: Approved / Needs review (with count) / All.
- Free-text search.
- Pagination (20 per page).
- Per-question "Approve" (when needs_review) or "Add to round…" (when approved)
  action, plus a round-picker flow.
- Bulk-approve by current filter combination.

## 2. Filters and search — additions

- **Duplicate/near-duplicate filter chip**: "Possible duplicates" — surfaces
  questions whose normalised subject+answer key (existing `questionKey()` helper
  already computes this) matches another question in the bank. This becomes possible
  once Codex's duplicate-detection validator (per the question-quality doc) tags
  matches; the UI chip is the surface for it, not a new detection mechanism.
- **"Never used" filter chip**: questions with `times_used` null or 0 — useful for a
  host who wants to specifically surface fresh content.
- **"Recently added" default sort option**: alongside whatever default sort exists
  today, add a sort-by dropdown with "Newest first" / "Most used" / "Least used" /
  "A–Z" — newest-first should be the default when no filter is active, so a host who
  just finished an AI generation run sees their new questions first without
  searching.
- **Search should match question text AND correct answer**, not just question text —
  confirm current behaviour and extend if it only covers question text.

## 3. Question-card information hierarchy

Every question card, front-to-back, should surface in this priority order (most
important/scannable first):

1. **Status badge** (top-left corner, always visible): one of Draft / Needs Review /
   Approved / Flagged (see §4 for exact state definitions). Colour-coded, not just
   text — matches the existing yellow "NEEDS REVIEW" treatment, extended to the other
   three states.
2. **Question type + topic** (small, top-right): e.g. "Multiple Choice · Sport."
3. **Question text** (largest text on the card, primary read).
4. **Answer preview** (secondary, smaller, below question text) — the correct answer
   or options, collapsed/truncated with an expand-on-hover or expand-on-click, not
   shown at full size by default (keeps card scan speed high across a full page of
   20).
5. **Usage indicator** (small, unobtrusive): "Used 3x · last: [venue], [date]" or
   "Never used" — this directly answers the "already-used indicators" requirement:
   a host scanning the library should immediately see whether a question is fresh or
   has been played at a specific venue before, without opening it.
6. **Duplicate warning** (only when flagged): a small red/amber inline note —
   "Similar to: '[other question's first few words]'" — not just a boolean flag, so
   the host can judge for themselves rather than trusting the system blindly.
7. **Actions row** (bottom of card, consistent position across all cards): buttons
   per §6.

## 4. Status states (draft / reviewed / approved / archived)

Four distinct states, each with a specific meaning — this is new structure beyond
today's two-state (`needs_review` true/false) model:

| State | Meaning | Who sets it | Visible where |
|---|---|---|---|
| **Draft** | AI-generated but not yet run through any validation pass (duplicate check, theme relevance, etc.) | System, at generation time | Question Library, filtered separately from Needs Review |
| **Needs Review** | Passed automated validation but flagged for a human decision (date-sensitive claim, contested answer, low difficulty-confidence) | System, or a host manually flagging a question they're unsure of | Question Library (existing behaviour, kept) |
| **Approved** | Cleared for use in any round | Host, via Approve action | Question Library default view |
| **Archived** | Retired from active use without deleting the historical record (a question the host doesn't want resurfacing but wants to keep for reference — e.g. an outdated current-events question) | Host, via a new "Archive" action | A separate "Archived" filter, hidden from all normal browsing/round-building views |

This distinguishes Draft (not yet validated) from Needs Review (validated but
flagged) — today's schema/UI conflates anything not-yet-approved into a single
"needs review" bucket. Codex to confirm whether this needs a new `status` enum column
or can be derived from existing fields (`needs_review` + a new `draft` boolean, say)
before treating the four-state model as a schema change requirement.

## 5. Delete vs. archive workflow

- **Delete** remains destructive and permanent, reserved for genuine mistakes
  (duplicate entries, questions with unfixable errors, test/junk data). Requires the
  existing confirm-dialog pattern with copy from `terminology-and-host-copy.md` §4.
- **Archive** (new) is the default "I don't want this anymore" action for anything
  that isn't a data-quality mistake — e.g. a dated current-events question, a
  question a host personally dislikes, a retired seasonal theme. Non-destructive,
  reversible via an "Unarchive" action in the Archived filter view.
- Card action label should make the distinction obvious: **"Archive"** (soft,
  reversible) vs. **"Delete"** (hard, permanent, behind confirmation) — never present
  both as equally-weighted buttons of the same visual prominence; Delete should be
  visually quieter/de-emphasised (smaller, greyer) so Archive is the path of least
  resistance for routine library grooming.

## 6. Exact action labels (per card)

Replacing "figure it out from context" with a fixed vocabulary used everywhere:

| Situation | Button label | Behaviour |
|---|---|---|
| Card is Draft or Needs Review | **"Review"** | Opens the review flow (inline expand or modal) showing full question detail + Approve/Reject/Edit |
| Card is Approved, not mid round-build | **"Add to Round…"** (existing, keep) | Opens round picker |
| Card is Approved, currently reviewing a specific round in "Build a Round" mode (§7) | **"Add"** (short form — round context already established, no need to repeat "to Round") | Adds directly, no picker |
| Any state | **"Edit"** | Opens inline edit (already exists, per prior session's "Add inline edit to Quiz Plan question cards" work — confirm this same inline-edit pattern is available from the Library too, not just from within a Quiz Plan round) |
| Approved or Needs Review | **"Archive"** | Soft-retires, per §5 |
| Any state | **"Delete"** | Hard delete, per §5, behind confirmation |
| Needs Review only | **"Approve"** (existing, keep) | Clears needs_review |
| Draft only | **"Approve"** should NOT appear — a Draft question must go through Review first; jumping straight to Approve from Draft skips validation entirely, which defeats the point of the four-state model in §4. |

## 7. Bulk selection and "Build a Round" behaviour

- Existing bulk-approve-by-filter stays.
- Add **bulk Archive** and **bulk Add to Round** for the current checkbox selection
  (checkbox selection already exists per `selectedQuestions` state — this extends
  what bulk actions are available on a selection, not the selection mechanism
  itself).
- **"Build a Round" mode**: a distinct mode (existing `buildRoundType` state suggests
  this partially exists already) where the host picks a target round type first, the
  Library filters itself to only question types valid for that round type (reusing
  the existing `allowedLibraryTypesForRound()` logic already built for the Quiz Plan
  picker), and every card's action becomes the short-form "Add" from §6 rather than
  "Add to Round…" — removes a redundant click when a host is deliberately building
  one round from the Library rather than browsing generally.
- Show a persistent, small running counter while in Build-a-Round mode: "7 questions
  added to [Round Name]" — confirms progress without the host needing to leave the
  Library to check.

## 8. Recently added / recently used sections

Two lightweight, dismissible strip sections above the main filtered grid (visible
only when relevant, not permanent chrome):
- **"Recently added"** — the last 10 questions added (via AI generation or manual
  entry) across all types, shown as a horizontal scroll strip, only when the Library
  is in its default unfiltered view. Disappears once any filter/search is active
  (avoids confusing overlap with filtered results).
- **"Recently used"** — the last 10 questions actually played live (by
  `game_history` join, most recent first), same horizontal-strip treatment. Useful
  for a host double-checking "did I already use this at [venue] last month."

## 9. Duplicate and quality warning surfacing

- A question flagged as a possible duplicate (per the question-quality
  validators Codex owns) shows the inline warning from §3.6 on its card at all times,
  not only inside a dedicated "Possible duplicates" filter — a host should see it
  wherever they encounter the question, not only if they think to check.
- A question flagged with low difficulty-confidence or a date-sensitive claim (per
  the AI question governance requirements) gets the same visual treatment as Needs
  Review, with the specific reason shown in the status badge tooltip/expansion
  ("Flagged: date-sensitive claim" vs. a generic "Needs Review") — the host
  shouldn't have to open the question to learn why it was flagged.

## 10. Summary of what's net-new vs. this session's existing work

For Codex's reference when scoping implementation effort — genuinely new structure
vs. wiring up existing pieces:
- **New**: four-state status model (Draft/Needs Review/Approved/Archived), Archive
  action + Archived filter, duplicate-warning inline surfacing, Recently Added/Used
  strips, sort-by dropdown, "Never used" filter, Build-a-Round running counter.
- **Extends existing**: Build-a-Round mode (partial state already present), bulk
  actions (selection mechanism exists, extend the action set), inline edit
  availability from Library cards (confirm existing Quiz-Plan-side inline edit is
  reachable from here too, don't necessarily rebuild it).
- **No schema change assumed without confirmation**: the four-state model may be
  derivable from existing + one new boolean column, or may need a proper `status`
  enum — Codex to decide based on the actual `question_bank` schema, this document
  only specifies the user-facing behaviour, not the storage shape.
