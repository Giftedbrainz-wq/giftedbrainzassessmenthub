# Gifted Brainz Assessment Hub — v50.6.0 (All 17 requested corrections)

This is an **updated source/deployment ZIP** derived from the supplied v50.5.0 Premium Examination edition. It **has not been deployed** to the live EdgeOne/Supabase environment in this conversation.

## Mandatory installation order

1. Back up your current Supabase database and deployed v50.5.0 build. Do not delete old tables, question pools, existing CBTs or attempts.
2. Verify that the existing standalone Brainz Biltz tables from `schema_brainz_biltz_standalone_migration.sql` already exist (if not, apply that *existing* standalone migration first). Open the existing Supabase project's SQL Editor and execute **`schema_v50_6_0_migration.sql`** before deploying these files. It adds scheduling/registration fields to existing standalone Brainz Biltz and a private `brain_boost_registrations` table. **Do not rerun `schema.sql` as a replacement** for an existing production database.
3. Deploy the contents of this ZIP to the **same EdgeOne site** as your previous Assessment Hub, including `index.html`, `app.js`, stylesheets, assets and `edge-functions/api/index.js`. Maintain the existing environment variables and existing Supabase project.
4. Force-refresh the browser so the changed `v50.6.0-implementation` JS/CSS references load. Validate the admin and a real student CBT on desktop and mobile before publishing any scheduled Brainz Biltz exam.
5. In Settings, re-enter the EduSpace HTTPS URL if no prior `eduspace_link` was saved. The green check confirms the **link setting is saved**; it is not a remote EduSpace authentication or connectivity test.

## Implemented corrections (17)

| # | Correction | Source/code area |
|---|---|---|
| 1 | Light-only mode. Removed theme controls and old dark CSS rules. | `app.js`, CSS, `index.html` |
| 2 | Restore passage display for CBT questions with passages stored in another quiz or in the central bank. Missing links report an error. | API `loadQuizBundle`, `studentQuestionPassage` |
| 3 | Restore the EduSpace HTTPS link field and saved-link success status. | Admin Settings; `eduspace-link` API; `app_settings` |
| 4 | Ensure white text on navy/blue buttons, navigation and banners, while preserving dark readable text on gold/pale backgrounds. | UI CSS |
| 5 | Configure Brainz Biltz start/end dates and show upcoming/open/closed phases; reject starts outside the window. | `boost-save`, `boost-public`, `boost-start`, `boost-submit` |
| 6 | Add device-bound student pre-registration and administrator-selected required fields. | `boost-register`, registration table, student screen |
| 7 | Keep manual, AI and TXT/DOCX/PDF question entry for standalone Brainz Biltz. | `boost-question-save`, `boost-question-batch-save`, import UI |
| 8 | Premium, distinct Brainz Biltz competition visuals. | `premium-interface.css` |
| 9 | Searchable paginated Results & Leaderboards card browsing (8 items/page). | `results()` |
| 10 | Participation, unique learners, average, pass-rate, distribution, per-test and per-question accuracy analytics. | `analytics()`, `analytics-questions` |
| 11 | Separate topic names and counts in student Question Pool selection. | `poolTopicsView()` |
| 12 | Tidy collapsible administrator pool-topic cards and count badges. | `pools()` |
| 13 | Constrain sidebar to one navigable internal scroll region, with responsive mobile drawer. | CSS |
| 14 | Unique top-three podium leaderboard in both on-screen view and exported PNG image. | `leaderboardListHtml`, `exportLeaderboardImage` |
| 15 | Compact leaderboard layout, responsive mobile typography, progressively revealed ranks. | CSS and `showMoreLeaderboard` |
| 16 | Save and show custom student information to administrators without exposing it on the public leaderboard. | registration UI/API and admin results |
| 17 | Correct registration/name form input and Back/Continue overlap; responsive spacing rules. | CSS |

## Important compatibility and privacy notes

- **Brainz Biltz has two modes** in this codebase: the newer standalone `?biltzQuiz=` mode with independent questions and the older CBT-linked `?biltz=` challenge mode. The standalone mode receives the new pre-registration and schedule fields; the CBT-linked challenge already has its own schedule and access workflow, which remains intact.
- Students' saved pre-registration is associated with their browser's device identifier. Changing device/browser, clearing site data or private browsing may require a new registration.
- Extra registration information is available in administrator-only views. Public scoreboards display names/scores without extra personal fields.
- The EduSpace link is stored server-side. Saving it does **not** prove that EduSpace is reachable or that a single sign-on account link has been established.
- New analytics are based on the available stored attempts, and per-question analytics sample up to the most recent 2,000 submitted attempts per CBT. Empty/missing historical answers cannot be reconstructed automatically.
- A question linked to a passage record that was previously deleted remains invalid; the system shows a clear missing-passage error rather than fabricating text.
- New standalone Biltz question import supports text-based questions only; image-dependent import for this standalone mode is not included.

## Local validation

`npm run check` checks JavaScript syntax and Python fixture compilation. `npm test` runs all existing regression suites plus standalone Brainz Biltz scheduling, required-field registration, batch-import checks, and a public-CBT integration test proving that a globally stored comprehension passage accompanies its linked question.

Passing local tests do **not** constitute live EdgeOne deployment, real database migration validation, or exhaustive visual checks on all devices. Run a controlled production-environment smoke test before replacing the live build.
