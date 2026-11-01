# Brainz Biltz v49 QA Report

**Release:** Gifted Brainz Assessment Hub v49 — Brainz Biltz

## Automated checks

- `npm run check` — JavaScript syntax checks for `app.js` and `edge-functions/api/index.js`, plus Python syntax compilation.
- `npm test` — existing private-library and private-quiz regression suite plus the Brainz Biltz regression suite.
- Existing private-library/quiz and 500-question save tests remain included.
- Brainz Biltz static/regression checks cover the database schema, public-link API, administrator-only challenge management, schedule/attempt rules, protected question delivery, private leaderboard access, payment-state messaging, progress recovery, version/cache references, and aura/reduced-motion UI styling.
- ZIP integrity checked after packaging.

## Deployment caveats

- Tests were run locally with code-level mocks/static assertions; the migration was not run against the user's live Supabase database.
- A browser end-to-end run was attempted in the build environment, but Chromium blocked local navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. Therefore, no browser E2E pass is claimed here.
- Before live use, apply `schema_brainz_biltz_migration.sql`, deploy the updated frontend and EdgeOne API together, verify the health endpoint, create a test challenge, and run through registration, approval, timed start, submission, and leaderboard publication in the deployed environment.
- Paid entry remains manually verified in v49; the challenge landing page does not collect payments.
