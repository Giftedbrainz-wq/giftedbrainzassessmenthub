# Gifted Brainz — Stability / 502 Recovery Deployment

This build combines the leaderboard redesign with the production stability corrections for the Supabase/EdgeOne gateway problem.

## 1. Existing production database: run the targeted repair

In Supabase SQL Editor, run **`schema_repair.sql`** first.

It is data-preserving. It does not delete quizzes, questions, passages, attempts or answers.

The production repair script now also creates the CBT Library tables and indexes. For an existing deployment, run **`schema_repair.sql`** once. The standalone **`schema_cbt_libraries_migration.sql`** is provided when you only want to apply the library portion. Both are additive and data-preserving.

It:
- repairs missing/duplicate result slugs before uniqueness is enforced;
- removes obsolete AI-save RPC overloads;
- creates `attempt_no` before any dependent index;
- normalizes device-scoped attempt numbers before the unique index is built;
- adds dashboard-aligned indexes;
- validates/caps AI question images in the atomic save function;
- installs the atomic `submit_attempt_atomic` submission function;
- refreshes planner statistics.

Do **not** drop or recreate the production database just to resolve a 502.

## 2. Deploy the matching EdgeOne API

Deploy:

`edge-functions/api/index.js`

The API now:
- preserves the historical score and total marks awarded when each attempt was submitted, so later CBT mark-allocation edits do not silently rescale completed results;
- rounds leaderboard scores for display without changing stored decimal scoring;
- supports multiple shareable CBT Libraries and publish-time library assignment;
- retries transient Supabase GET/HEAD failures;
- preserves upstream Supabase status codes for diagnostics;
- uses bounded timeouts;
- avoids unsafe automatic retries for writes;
- uses bounded/paged reads;
- uses bulk dashboard bootstrap reads instead of per-CBT N+1 reads;
- omits large base64 images from dashboard bootstrap;
- loads student question diagrams on demand;
- falls back safely when a single image cannot be retrieved;
- submits an attempt atomically with its answer rows.

Keep these server/function variables configured:

`SUPABASE_URL`

`SUPABASE_SECRET_KEY`

`GROQ_API_KEY`

`ADMIN_PASSWORD`

`SESSION_SECRET`

## 3. Deploy the updated frontend

Deploy the package's:

`index.html`

`app.js`

`styles.css`

`assets/`

The HTML uses a cache-busted `app.js` version so the browser/CDN does not silently keep an older dashboard build.

## 4. Verify health before testing the dashboard

Open:

`/api?action=health`

Expected core fields:

- `databaseConfigured: true`
- `databaseOk: true`
- `databaseError: ""`
- `build: "v29-colors-feedback-20260929"`

`aiConfigured` is independent of ordinary dashboard loading.

## 5. Test the repaired flow

1. Sign in as administrator.
2. Open an existing CBT and open its leaderboard.
3. Confirm the CBT title appears in the leaderboard header.
4. Confirm students are shown with earned numeric score, percentage and time; multi-subject results show each subject score plus an Aggregate.
5. Confirm the leaderboard uses the simple standard table with no podium/medal cards or student avatars.
6. Select Top 10 and export the leaderboard as PNG.
7. Open a published student link and verify the WhatsApp screen shows the CBT title, question count and duration.
8. Start a test and confirm question diagrams appear when available.
9. Submit a test and confirm both the result and answer corrections are present.

## 6. If the dashboard still reports a gateway problem

The new frontend should expose a more specific diagnostic such as the affected dataset or a statement that the basic table checks are healthy but bootstrap is failing.

If `/api?action=health` is healthy but bootstrap still reports a failure, inspect the deployed EdgeOne function version and its server environment values before changing the database again.

## Important limitation

Application-level hardening can reduce the chance and impact of transient 502s, but it cannot guarantee uninterrupted service during a genuine Supabase or EdgeOne infrastructure outage. The build is intentionally designed to degrade gracefully and preserve useful diagnostics rather than showing a generic dashboard failure.

## 7. v18 student-link fix
This build fixes a client-side navigation defect that could prevent students from reaching a CBT when a normal `?quiz=` link was opened without a browser `window.opener`. Shared CBT and library links now load the quiz directly.


## v25 score/theme verification
- Single-section quizzes show overall score as `earned / total` on both the student result and leaderboard.
- Multi-section/multi-subject quizzes show each subject/section as an earned whole-number score only, with the overall Aggregate displayed as `earned / total`.
- Student Light/Dark Mode is available before, during and after the CBT; switching during the CBT is presentation-only and does not reset answers, timer or question position.
- Official leaderboard exports use a centered Gifted Brainz logo plaque, an `OFFICIAL` header hierarchy and deliberate spacing before the results table.


## v27 post-audit deployment notes

- Final hardening: existing oversized question diagrams are preserved during unrelated question edits, explicit diagram removal now correctly clears image data, SVG data-URI validation is aligned across the browser/API/full schema, and published CBT image availability falls back to on-demand media loading if the lightweight image-ID lookup is temporarily unavailable.
- Deploy the complete package together so the frontend cache-buster and EdgeOne API build identifier stay aligned.
- No database migration is required solely for the v27 diagram/review hardening; the existing schema and repair SQL remain compatible.
- `schema_repair.sql` remains the targeted data-preserving repair for an existing production Supabase database.
