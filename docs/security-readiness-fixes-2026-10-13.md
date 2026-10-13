# Security and readiness fixes — 13 October 2026

## Deployment status

The full ownership/gameplay migration is applied to production. Sonya explicitly
confirmed `sonya@sonyamac.co.uk` as the owner of legacy content. The migration
passed a live transactional dry run before application, and an active-quiz guard
passed before changes were saved. A private recovery snapshot remains available.
Question/library row counts match the snapshot, and their ownership is verified.

The matching player client was merged in PR #1 and successfully deployed to
production as `c64b328`. Anonymous REST probes receive HTTP 401 for questions,
question_bank, rounds, media_assets, raw sessions, teams and session_rounds.
Safe player_sessions/player_teams reads return HTTP 200; player session realtime
publication and revoked anonymous scoring privileges are verified in the live DB.
Live authenticated-role probes confirm the primary host can access the library
and another host cannot read that library or the primary host's quiz plans.
Production login returns 200; unsigned Pixabay/Deezer search and Deezer preview
requests return 401; an unsafe media-proxy URL returns 400.

## Changes

- Upgrade Next.js and its lint configuration to 16.4.0; upgrade sharp and
  vulnerable transitive dependencies. Production dependency audit reports zero
  vulnerabilities. The development-only braces/micromatch lint-tool dependency
  chain still has registry advisories; npm's proposed forced downgrade to Next
  14 lint configuration is inappropriate for this project.
- Preflight enforces saved question targets, validates question text, answer
  presence, numeric answers, complete/distinct option sets and valid answer keys.
  Word-only Match Made remains supported. Session creation revalidates the fresh
  database rounds immediately before creating the session.
- Media proxies validate parsed HTTPS hostnames, disallow credentials and
  nonstandard ports, and suppress internal error details. The preview proxy
  requires host authentication, forbids redirects and caps time/size/content
  type. Search APIs require authentication. Picture generation uses the server
  search route rather than putting the Pixabay key in the browser request.
- Library, venue, settings, calendar, offer and live-session data receive owner
  policies. Existing permissive policies and anonymous column grants are removed.
  Existing unowned rows are assigned automatically only when there is exactly
  one authentication account; otherwise the migration aborts transactionally.
- Anonymous clients cannot read raw sessions, snapshots or teams. A dedicated
  player session table publishes allowed fields, hides answers and internal
  verification metadata until reveal, and excludes future Pursuit questions.
  A safe team view excludes private handset hashes and unmoderated photos.
- Handsets use token-checked join, heartbeat, photo lookup, card and choice RPCs.
  Answer insertion requires their private token and the current question/round,
  live phase, correct Hot Seat team and server-side answer deadline. A name-only
  reconnect can watch but cannot impersonate the original handset.
- Host scoring RPCs check session ownership before any mutation or idempotency
  write. The obsolete Reverse overload without a token is revoked. Hot Seat
  claims require the handset token. Photo submissions cannot self-approve.
  Score idempotency keys are scoped to a session and team to prevent another
  session or handset from reserving the same key and blocking legitimate scores.

## Verification

- Full automated suite: 208 passing tests, including private recovery snapshot
  coverage.
- PostgreSQL integration tests execute the real migration through PGlite,
  including pgcrypto, legacy policies and malicious legacy column grants.
  They cover anonymous answer/hash exposure, two-host isolation, owner scoring
  and idempotency, secret-free player state, server answer deadlines, forbidden
  game mutations, joins/choices/cards, moderation, stable server-side Sequence
  shuffling and transactional failure on ambiguous legacy ownership.
- Live REST CORS preflight accepts the custom handset-token header.
- New API/helper files pass focused lint. The repository-wide lint baseline
  remains 52 errors; it is not represented as passing.
- Automated tests made no paid AI-generation calls. The approved production
  migration was separately applied and verified through the Supabase console.

## Apply and verify

1. Finish any active quiz. Export/verify a database backup before changing live
   permissions. Inspect the existing schema and policy/function definitions in
   Supabase against the migration; dashboard-created tables are not fully
   represented by this repository. Confirm `pgcrypto` is installed in
   `extensions`, and prior tracked migrations have been applied.
   The live inspection found no recent active quizzes, three authentication
   accounts, the expected schema/RPC signatures and `pgcrypto` in `extensions`.
   All existing plans, venues and events belong to one account; confirm the
   unowned library mapping before setting `quizit.legacy_owner` in the migration
   transaction. `supabase/sql/launch_security_backup.sql` creates a private
   recovery snapshot inside the same project without changing source rows.
   This snapshot is now verified: library/round row counts match, every backup
   table has RLS enabled, and anon/authenticated have no schema access.
2. Apply `supabase/migrations/202610130001_launch_security.sql` as one transaction.
   If ownership is ambiguous, stop and explicitly map unowned rows to the correct
   host. Do not substitute the oldest account or silently delete content.
3. Deploy the matching player client promptly. Do not start a quiz between the
   migration and deployment. Verify `player_sessions` is in the realtime
   publication. New joins use freshly minted tokens; old name-only reconnections
   are deliberately viewing-only.
4. Repeat read-only anonymous and two-host access probes against production,
   then rehearse an isolated quiz with actual phones: join, answer, timer expiry,
   reconnect, Hot Seat, Match Made, Pursuit, cards, Hard Deck, Spin, host scoring,
   moderated photos, music and finale. Verify private answers are absent from
   network/realtime payloads before reveal.
5. Configure a server-only `PIXABAY_API_KEY` and retire/rotate any previously
   exposed public Pixabay key. Check the production Anthropic key separately:
   the earlier local key probe failed authentication; no credential was changed.
   Verify the production Blob token and generation with a bounded spend cap.

Authenticated console access, live schema inspection, private recovery snapshot,
confirmed legacy ownership, full security migration and matching production
deployment are complete. Production rehearsal with real phones and provider
credential validation remain pending. This work is not a public-launch approval.
