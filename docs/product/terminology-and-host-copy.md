# Terminology Guide & Host-Facing Copy Library

Owner: Claude (content/product spec). This is the single source of truth for user-
facing wording across Quiz-It — host console, player handset, and TV display. New
copy anywhere in the product should match the terms and tone defined here rather than
inventing new phrasing per-screen.

---

## 1. Terminology guide

Use these terms consistently, everywhere, in this exact form:

| Term | Use for | Do not use |
|---|---|---|
| **Quiz** | The whole event a venue runs on a given night | "Game," "Event" (Event is reserved for the calendar/booking record) |
| **Round** | A block of questions of one type/theme (e.g. "Round 3: Music") | "Section," "Chapter" |
| **Question** | A single item a team answers | "Query," "Prompt" |
| **Session** | The live, running instance of a quiz once it's started on stage | "Game session" only in code/logs, never in host or player-facing copy |
| **Team** | A group of players joined under one name | "Player" (Player refers to one person; Team is the scoring unit) |
| **Player** | An individual person on a team's phone | — |
| **Display** | The TV/projector screen | "Screen," "Big screen," "Presentation" |
| **Handset** | A player's phone/device running the quiz in-browser | "App," "Device" (players never install an app — avoid implying they did) |
| **Host console** / **Mission Control** | The screen Sonya (or any host) runs the live show from | "Admin panel," "Dashboard" (Dashboard is reserved for Back Office analytics) |
| **Back Office** | The non-live management area (Quiz Plan, Question Library, Reports, Settings) | "Admin," "CMS" |
| **Lock in** | Submitting a final answer | "Submit" (fine in code, but player-facing buttons say "LOCK IT IN" per existing `AnswerKeypad` copy — keep consistent) |
| **Power Card** | Reverse, Boost, Danger Zone, and similar special-effect mechanics | "Power-up," "Special ability" |
| **Round Leader(s)** | The team(s) currently ahead within the current round only (vs. overall) | "Winner" (reserve Winner for the final result) |

---

## 2. Voice and tone

- Host-facing copy: direct, calm, operational. The host is mid-show and needs to
  parse a message in under a second — no jokes, no filler words, imperative mood
  ("Retry audio," not "Would you like to retry the audio?").
- Player-facing copy: warm, energetic, brief. Matches the existing playful tone of
  "LOCK IT IN," "Tap letters to answer…" — short, punchy, never more than one short
  sentence per state.
- Never blame the player/host for an error. "Answer received after time closed," not
  "You answered too late."
- Numbers and counts are always digits, never spelled out ("3 teams joined," not
  "Three teams joined") — scannable at a glance on both host and TV surfaces.

---

## 3. Host recovery / error message library

These are the concrete strings for the "plain-language recovery message" requirement
from the platform review. Each pairs a situation with required wording and the
information it must carry. Codex should route every matching failure path through
these strings via the existing toast/alert component rather than a raw
`console.error` or a generic fallback message.

| Situation | Required host-facing message |
|---|---|
| Score written to database, but the read-cache refresh (`scoreboard_data`) failed | "Score saved. Display and handsets may show an old total — refreshing now." (auto-retry the refresh; only show this if the retry hasn't yet succeeded) |
| `apply_score_delta` RPC call itself failed | "Score NOT saved for [team]. Retry now — do not move to the next question yet." |
| Audio failed to start (autoplay blocked, load error, etc.) | "Audio didn't start. Tap Retry Audio." (a visible retry control must accompany this, not just the text) |
| One or more handsets are still on a previous question when the host advances | "[N] team(s) haven't loaded this question yet." (show which teams by name if the list is short enough to fit) |
| A player's answer arrives after the question has been scored/closed | Do not error to the host at all — silently exclude the late answer from scoring, log it, and surface only if the host explicitly opens a diagnostics view. |
| Display hasn't acknowledged the current phase within the expected window | "Display hasn't confirmed [phase name] yet. Check the TV/projector connection." |
| A team disconnects mid-question | "[Team] disconnected. Their last answer is still counted if one was submitted." |
| A team reconnects mid-question | No error needed — reconnect should be silent and invisible to the host unless it affects scoring eligibility. |
| Attempting to start a quiz with a round that has zero questions | "Round '[round name]' has no questions. Add questions before starting." (block start, don't just warn) |
| Attempting to delete a round with questions already in it | See §4 below (confirmation dialog copy). |
| Network/Supabase connectivity lost entirely | "Connection lost. Reconnecting…" with a persistent, unmissable banner (not a toast that can be missed) until connectivity returns. |

---

## 4. Confirmation dialog copy (destructive actions)

Every destructive, irreversible action must use this exact pattern — a short specific
question, the consequence spelled out, and a clearly labelled confirm button that
names the action rather than a bare "OK."

**Remove a round** (currently missing entirely — see platform review, Quick Win #2):
- Title: "Remove this round?"
- Body: "This deletes '[round name]' and all [N] questions in it. This can't be undone."
- Buttons: "Cancel" / "Remove Round" (not "OK"/"Yes")

**Delete a library question:**
- Title: "Delete this question?"
- Body: "This removes it from your library permanently. It will not affect rounds
  where it's already been used tonight." *(confirm this second sentence is
  factually true before shipping — Codex to verify against actual delete behaviour)*
- Buttons: "Cancel" / "Delete Question"

**End a live quiz early:**
- Title: "End the quiz now?"
- Body: "Scores will be finalised and the winner screen will show. You can't resume
  this quiz after ending it."
- Buttons: "Cancel" / "End Quiz"

---

## 5. Empty states

| Screen | Empty-state copy |
|---|---|
| Question Library, no results for current filter | "No questions match these filters yet. Try a different type, or generate new ones." + a visible "Generate Questions" action, not just text. |
| Reports, no quizzes hosted yet | "No quizzes hosted yet. Once you run your first live show, it'll show up here." |
| Round Library, empty | "No saved rounds yet. Build one in Quiz Plan and it'll appear here for reuse." |
| Team list before any teams join | "Waiting for teams to join…" with the live join-count/QR code, never a bare blank panel. |

---

## 6. Pre-show / live rules copy

Existing round-rules screens (per `buildRules()` in `app/host/quiz/page.tsx`) should
follow this structure for every round type, in order: (1) one-line summary of the
goal, (2) how points are earned, (3) any special mechanic unique to the round.
Keep each bullet under ~12 words. Example structure for reference (Nearest Wins,
already shipped, used here as the house style to match):
- "Guess the exact number — closest wins."
- "Closest guess scores full points, 2nd gets 60%, 3rd gets 30%."
- "Ties go to whoever answered first."

Apply this same three-part structure to any new or revised round-rules copy.

---

## 7. Host tool tooltips (replacing/standardising native `title` attributes)

Once the icon system replaces emoji (per platform review Quick Win #1), each host
tool's accessible label/tooltip text should read as an instruction, not a label:

| Tool | Tooltip copy |
|---|---|
| Block team | "Block this team from answering the current question" (unblock state: "Unblock — let them answer this question") |
| Scramble keyboard | "Scramble this team's keyboard for the current question" (unscramble state: "Unscramble their keyboard") |
| Show round leaders | "Sort and highlight by points scored in this round instead of the running total" |
| Two-column team list | "Switch the team list between one and two columns" |
| Tap team for stats | "Tap for this team's stats" |

(These match the `title` strings already shipped this session — recorded here so
future tools follow the same "instruction, not label" pattern rather than drifting.)
