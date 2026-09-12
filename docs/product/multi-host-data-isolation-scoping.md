# Multi-host data isolation: scoping notes

Owner: Claude (found during a read-only pre-launch audit, 2026-09-12). Not started -
this is a scoping document to work from, not a completed fix. Flagged as a
prerequisite for the existing "Multi-host rollout: legal docs, branding, data
isolation" task, and for the customer segmentation already laid out in
`commercial-launch-positioning-and-readiness.md`.

## The problem, in one paragraph

Quiz-It today has exactly one host (Sonya). Two tables are already properly scoped
per-host: `quizzes`/`quiz_rounds` (RLS: `owner_id = auth.uid()`) and `events` (RLS:
`host_id = auth.uid()`). Everything else a host builds - **venues, the Question
Library (`question_bank`), the Round Library (`rounds`), `sponsors`, and
`victory_songs`** - has no ownership column, no per-host RLS policy, and no
filtering in the application queries either. Every host who signs up would read and
write from the same shared pool as every other host. This is invisible today only
because there is exactly one host; it becomes a real cross-tenant data leak and
accidental-deletion risk the moment a second host account exists.

## What was checked, and how

- Grepped every `supabase/migrations/*.sql` file for `owner_id`/`host_id` columns
  and for `create policy` statements referencing each host-content table.
- Confirmed `quizzes`/`quiz_rounds` (`202607180002_quiz_builder.sql`) and `events`
  (`202607160001_create_events.sql`) both have real per-owner RLS - `using
  (owner_id = auth.uid())` / `using (host_id = auth.uid())` on every command.
- Found no tracked migration that creates `venues`, `question_bank`, `rounds`
  (Round Library), or `sponsors` at all - consistent with the pattern already
  called out in `202608260001_rls_disabled_public_tables.sql`, where some tables
  were created directly in the Supabase dashboard rather than through a tracked
  migration. Their live RLS state couldn't be verified from this repo, so Sonya
  checked Supabase Studio directly (2026-09-12) for `venues`: RLS is enabled, but
  five policies grant fully open access with no host scoping at all -
  `authenticated_full_access` (ALL, to `authenticated`) plus one policy per
  command (`venues_select_anon` / `_insert_anon` / `_update_anon` /
  `_delete_anon`), each `to public` - meaning no login is required at all.
  Anyone holding the site's public anon key can currently read, create, edit, or
  delete any venue. Fixed in `202609120001_venues_owner_scoping.sql`, which drops
  all five by name before adding the owner-scoped replacement. `question_bank`,
  `rounds`, and `sponsors` are very likely running the same open pattern (same
  untracked-table history, same naming convention already seen on `venues` and
  on `teams` during an earlier live-rehearsal bug) - each will need the same
  "check Studio for the real policy names, drop them by name" treatment before
  its own owner-scoping migration, not just a bare add-the-new-policy migration.
- Checked `victory_songs`' migration directly (`202609010001_victory_songs.sql`):
  it explicitly grants `insert`/`update`/`delete` `to authenticated using (true)` -
  by design, not by oversight, any logged-in host can edit any row. Fine for one
  host; a real cross-tenant write hazard for more than one.
- Checked application code for a compensating client-side filter (in case RLS is
  looser than the query layer): `app/host/venues/page.tsx` fetches `venues` with no
  filter at all - `supabase.from("venues").select("*")` returns every row in the
  table, for any logged-in host. No per-host narrowing exists at the query layer
  either.

## Tables needing work, and what each needs

| Table | Current isolation | Used from (non-exhaustive) | Work needed |
|---|---|---|---|
| `venues` | None - no owner column, no RLS scoping, no query filter | `app/host/venues`, `app/host/events` (venue picker), `app/host/session` (venue lookup at session-create) | Add `owner_id uuid references auth.users`, backfill existing rows to Sonya's user id, add RLS matching the `quizzes` pattern, add `.eq("owner_id", ...)` (or rely on RLS alone once trusted) to every read/write call site |
| `question_bank` | None | `app/host/question-bank`, `app/host/questions` (manual entry + AI generation), `app/host/quizzes` (random-from-library pulls) | Same shape as `venues`. Note: this is the largest, most actively-written table in the app (38k+ SpeedQuizzing import rows plus ongoing AI generation) - migration needs to backfill all existing rows to Sonya's account explicitly, not leave them ownerless |
| `rounds` (Round Library) | None | `app/host/rounds`, `app/host/quizzes` (Add Round picker), `lib/quiz/roundLibrarySync` (auto-sync from Quiz Plan rounds) | Same shape. The auto-sync path (`202608110002_round_library_sync.sql`) also needs to write the correct `owner_id` on every synced row, not just at read time |
| `sponsors` | None | `app/host/sponsors`, round display (`sponsor` field referenced by round data) | Same shape, lower urgency (smallest table, least actively written) |
| `victory_songs` | Explicitly shared (`using (true)` on write) | `app/join/join-form.tsx` (player-facing song picker), `app/host/victory-songs` (admin list) | Product intent confirmed with Sonya (2026-09-12): per-host customizable, same as venues/gigs/songs generally - every host builds their own list. Same `owner_id` treatment as the others, not a shared catalog. `app/join/join-form.tsx`'s song picker needs to resolve which host owns the session (via `sessions.owner_id`/the session's linked quiz) and only show that host's songs, not a global list |

## What's already safe (no work needed)

- `quizzes`, `quiz_rounds` - real `owner_id` RLS, verified correct.
- `events` - real `host_id` RLS, verified correct.
- Everything under a live `sessions` row (`sessions`, `session_rounds`, `teams`,
  `scores`, `answers`, `session_photos`, etc.) is scoped by session PIN, not by
  host account - a different, already-working isolation model (a session's data is
  private to that session regardless of which host owns it), and out of scope for
  this document.

## Suggested approach when this is picked up

1. Add `owner_id uuid not null references auth.users(id) default auth.uid()` to
   `venues`, `question_bank`, `rounds`, `sponsors`, and `victory_songs` in one
   migration, backfilling every existing row to Sonya's user id explicitly (not
   relying on the column default, since existing rows predate the column).
2. Add RLS policies to each matching the already-proven `quizzes` pattern (`for all
   to authenticated using (owner_id = auth.uid()) with check (owner_id =
   auth.uid())`).
3. Audit every `.from("venues")`, `.from("question_bank")`, `.from("rounds")`,
   `.from("sponsors")`, `.from("victory_songs")` call site across `app/host/**` -
   once RLS is in place these should mostly "just work" (RLS filters server-side
   regardless of the query), but any query using `service_role` (bypasses RLS
   entirely) needs an explicit `.eq("owner_id", ...)` added by hand.
4. `app/join/join-form.tsx`'s victory-song picker is player-facing, not host-facing
   - it needs to resolve the hosting host's `owner_id` via the session/quiz chain
   and filter to that host's songs specifically, since a player joining should only
   ever see the list the actual host who's running their quiz built.
5. This is schema + RLS work touching many files - likely needs Codex's
   involvement, not a solo UI-side fix, given the ownership split already
   established for this project.
