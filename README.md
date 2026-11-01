# Gifted Brainz Assessment Hub — Final Production Package

A branded online CBT/assessment platform for EdgeOne + Supabase + Groq.

## Included features
- Modern navy/gold branded admin UI and professional typography
- Secure admin login with a server-side signed session
- Manual question creation and editing
- Multiple-choice and passage-based questions
- AI question generation with natural-language question-type detection
- AI extraction from text-based PDF, DOCX, TXT and CSV documents
- Human review before AI questions are saved
- No artificial 20-question CBT limit; manual CBTs can contain as many questions as the database can support
- Large AI generation requests are batched automatically to stay within model/request limits
- Multiple CBT sections with independent student section switching
- Answers persist while students move between sections
- Per-CBT duration, pass mark, result visibility, leaderboard visibility, question shuffle and option shuffle
- Custom student information fields; private fields are not exposed on leaderboards
- Student landing page → WhatsApp channel gate with CBT summary → student details → instructions → CBT
- Question navigator, answer persistence and flagging
- Student result, simple leaderboard, retake and exit experience
- Admin results, branded per-CBT leaderboards, Top-N PNG export and analytics
- Server-side scoring and server-side attempt timing, with atomic submission of attempts and answer rows
- Supabase Row Level Security remains enabled; database access is performed by the EdgeOne server function

## Architecture
- EdgeOne: static frontend + server-side EdgeOne Function API
- Supabase: quizzes, sections, passages, questions, attempts and answer records
- Groq: AI question generation/extraction using `openai/gpt-oss-120b`
- Browser never receives the Supabase secret or Groq API key

## EdgeOne build settings
- Preset framework: `Other`
- Root directory: `/`
- Build output directory: `/`
- Build command: empty
- Install command: empty
- Production branch: `main`

The EdgeOne function at `edge-functions/api/index.js` is intended to be exposed as `/api`.

## EdgeOne server environment variables
Set these as server/function environment variables:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=YOUR_SUPABASE_SECRET_KEY
GROQ_API_KEY=YOUR_GROQ_API_KEY
GROQ_MODEL=openai/gpt-oss-120b
ADMIN_PASSWORD=CHANGE_THIS_TO_A_STRONG_PASSWORD
SESSION_SECRET=GENERATE_A_LONG_RANDOM_SECRET
```

`SUPABASE_SECRET_KEY` must be the Supabase Secret key (`sb_secret_...`) or the legacy `service_role` key. Do not use the Publishable/anon key. The API also accepts the legacy environment variable name `SUPABASE_SERVICE_ROLE_KEY` as a fallback.

Never put the real values above in GitHub.

## Supabase database stability repair

This build includes a corrected `schema.sql` and a targeted `schema_repair.sql`, including the Student Feedback feature introduced in v29. The previous schema contained stale REVOKE/GRANT statements for a removed `save_questions_batch_atomic_v2(uuid, uuid, jsonb)` function, and it created indexes that referenced `attempt_no` before that column existed. Both migration defects are corrected.

For an existing production database, use `schema_repair.sql` first. It is intentionally data-preserving: it does not delete quizzes, questions or student attempts. It also installs the atomic `submit_attempt_atomic` function so an attempt cannot be left marked submitted if its answer rows fail to commit.

The API is hardened against transient Supabase 408/429/500/502/503/504/520/521/522/524 responses with bounded GET retries and timeouts. Large question images are no longer shipped in dashboard/public-CBT bootstrap responses; student diagrams are fetched on demand. The admin bootstrap uses bounded bulk reads instead of N+1 per-CBT requests.

## Supabase database
Run `schema.sql` in the Supabase SQL Editor. The script is designed to create the required tables and upgrade the earlier Gifted Brainz schema with sections, passages, custom student data and attempt status. It is intended to be rerunnable.

Keep Row Level Security enabled. There are intentionally no public policies because all database operations go through the EdgeOne server function using the Supabase Secret/Service Role key.

## AI
The AI Question Studio uses Groq. The application sends AI requests from the EdgeOne server, not from the browser.

`openai/gpt-oss-120b` supports Groq Structured Outputs/JSON Schema. The application uses strict JSON Schema output and validates every returned question before allowing it into the review area. The application does not use the unsupported `temperature` parameter.

AI generation requests from the browser are batched in groups of 10. Therefore the CBT itself has no 20-question restriction; the batching only protects the AI API call size/rate limits.

## Student launch, WhatsApp gate, leaderboard and maths
- Published CBT links use short random launch tokens and open the exam in a dedicated tab when the browser permits.
- Every test attempt passes through the Gifted Brainz WhatsApp Channel gate before student details. The gate shows the live CBT title, question count, duration, pass mark and section count.
- Admin, public and student leaderboards show the overall earned/total score plus percentage; admin views retain operational timing fields needed for management, while public/student views omit those fields. No student photographs/avatars are used.
- Admins can export Top 5/10/15/20/25/50/100 leaderboard rows as a branded PNG image.
- Student/admin maths supports LaTeX plus `frac(5)(8)`, `sqrt(x)` and `matrix[1,2;3,4]` shorthand.

## Document extraction
- PDF text is extracted in the browser using PDF.js, with image-bearing pages detected and associated with extracted questions.
- DOCX text is extracted using Mammoth, including embedded-image markers.
- TXT and CSV files are read as text.
- Extracted text (and detected images) are sent to Groq, which imports the complete question, four options, answer key and explanation/reason/solution when present, with missing items flagged for review.
- Scanned image-only PDFs require OCR and are not automatically readable unless they contain a text layer.
- Documents larger than 20 MB are rejected by the browser; extracted text is also limited server-side to 180,000 characters per extraction request to keep AI requests manageable.

## Student timing and scoring
When a student begins a CBT, the server creates a `started` attempt and records the server start time. On submission, the server calculates elapsed time from that server timestamp and calculates the score from the stored correct answers. The browser's displayed timer is only a user interface; it is not trusted for scoring or timing.

Submitted attempts are the only attempts included in admin/public leaderboards. Abandoned `started` attempts are excluded.

## End-to-end test
1. Run `schema.sql` in Supabase.
2. Set the six EdgeOne server variables.
3. Deploy/redeploy EdgeOne so the stability-fixed API is active.
4. Hard-refresh the browser so the cache-busted `app.js` is loaded.
5. Log in as administrator.
6. Create a CBT with title, description, instructions, duration and pass mark.
7. Configure that CBT's result, leaderboard and shuffle settings.
8. Add sections such as Mathematics, English Language, Physics and Chemistry.
9. Add a manual question or generate AI questions.
10. Optionally upload a PDF/DOCX/TXT/CSV document for extraction.
11. Review and save questions.
12. Publish the CBT.
13. Copy the generated student link and open it in an incognito window/device.
14. Confirm the link opens only the selected CBT and never the admin dashboard.
15. Enter student details and proceed through the instructions page.
16. Complete the CBT, switch between sections, flag questions and return to earlier questions.
17. Submit the CBT and confirm the result/leaderboard behaviour follows that CBT's individual settings.
18. Confirm the admin can see the per-CBT leaderboard and analytics.
19. Confirm a private field such as phone number is not shown on any leaderboard.
20. Test a CBT with result disabled and another with leaderboard disabled to confirm the settings are independent.

## Admin sign-in diagnostics
If an admin password is accepted but the dashboard data cannot load, the app keeps the valid session and shows a persistent diagnostic banner instead of showing a misleading success toast. The sign-in screen also performs a health preflight against `/api?action=health`. The health endpoint checks all required Supabase tables (`quizzes`, `quiz_sections`, `passages`, `questions`, `attempts`, `attempt_answers`, `cbt_libraries`, `cbt_library_items`) and reports the failing table/configuration without exposing secret values. Only a real HTTP 401 clears an existing admin session.


## Operator error migration (v3)
Run the complete `schema.sql` in the target Supabase project before using AI Save. This migration removes every legacy `save_questions_batch_atomic` overload and installs `gb_save_ai_questions_v3(jsonb)`. The API calls only the new RPC.


## 2026-09-22 UX fixes
- The WhatsApp channel gate now persists its opened state for the current assessment tab using session storage, so switching into WhatsApp or a brief page reload does not re-lock the Continue button.
- The gate now gives explicit numbered instructions for opening WhatsApp, following the channel, returning to the CBT, and continuing. It also explains that a WhatsApp follow cannot be verified automatically by the assessment page.
- Leaderboard PNG export uses a dedicated branded poster with stable system typography and a consistent results table. It does not use podium cards, medals or student photographs.


## CBT Libraries and dynamic leaderboard scores

For a fresh Supabase database, run `schema.sql`. For an existing deployment, run `schema_private_cbt_libraries_migration.sql` before deploying the matching API. The CBT Libraries screen supports public libraries (anyone with the link) and private libraries (approved devices only). Libraries can contain multiple published CBTs, and a CBT can belong to multiple libraries. Publishing a CBT offers library assignment.

Leaderboard display scores are rounded to whole marks. Submitted attempts retain the score and total that were awarded when the attempt was completed; later CBT mark-allocation edits do not silently rescale historical results.


## v11 Student UI refinement
- Simplified the WhatsApp pre-test gate into a clearer 3-step flow.
- Separated assessment information from the pre-test action area.
- Compactened the CBT tab-switch warning.
- Added an explicit Current status to the Question Navigator and kept the current state visually dominant.

## v15 latest requested refinements
- Public CBT Library heading and description are explicitly centered, with a centered green Available CBTs status card.
- Library CBT cards retain centered titles, descriptions and Take CBT actions with stronger spacing and mobile balance.
- Leaderboard image exports use the same `Source Serif 4` typography loaded by the main application; the quiz title is centered in the exported header.
- CBT settings now support a numeric maximum-attempt value up to 10,000 or an Unlimited attempts mode. Unlimited is stored as `null` in `settings.maxAttempts` and is enforced server-side per device.
- Student submission responses report `attemptsRemaining: null` for unlimited CBTs, and the result page keeps the Retake Test action available with an Unlimited attempts label.
- Result score rings are thicker, brighter and use stronger status colours while keeping the application's `Source Serif 4` typography.


## v20 post-audit corrections
- Score rings now begin at the 12 o'clock position and sweep clockwise.
- Single-student leaderboard removal is implemented as a retained `removed` attempt tombstone. The deleted attempt stays excluded, and the admin action frees an active-attempt slot so the student can retake. See the v46 note below for the current first-attempt leaderboard policy.
- Submitted attempt `score` and `total` are treated as historical values; editing a CBT's later section allocations no longer silently rescales old results. Per-question awarded marks are also stored for later corrections/review.
- Admin leaderboard loading no longer references an undefined quiz identifier.
- Section mark allocation requires either marks for every section or no section marks, and it cannot be combined with equal-mark distribution.
- Frontend cache-busting has been advanced to the v20 build so browsers do not reuse the older v18 app/CSS bundle.


## v23 Full-Audit Revision

This revision includes the official centered leaderboard presentation plus a full package audit. It also restores the leaderboard refresh runtime function, preserves scroll position during question selection, keeps zero-score attempts deletable, ensures an open leaderboard modal refreshes after clearing, completes light/dark shared theme variables, resets document-image caches before each import, updates the API build identifier, and makes the local mock server portable.


## v23 audit notes
- The current EdgeOne API requires the `clear_quiz_attempts_atomic(uuid)` RPC used by **Clear leaderboard**; the targeted repair script now installs the same function as the full schema. It deletes submitted attempts only and leaves live `started` attempts intact.
- The public leaderboard response deliberately contains only rank, student, score and percentage; administrator responses additionally retain the attempt identifier and operational timing fields needed for management and deletion.
- The current frontend cache-buster is `v29-colors-feedback-20260929`.

## v24 subject score breakdown — 2026-09-28
- Multi-section/multi-subject results now return a server-calculated `subjectScores` breakdown using the stored effective marks for each section/subject.
- Student and shared result pages display each subject as an earned numeric score (for example, `Mathematics 98`). v25 subsequently refined the overall `Aggregate` to retain its `earned / total` denominator.
- The v24 visible-score format was superseded by v25: subject breakdowns remain plain earned marks, while overall/aggregate score cells retain `earned / total`.
- The official leaderboard remains focused on rank, student, overall earned/total score and percentage; subject breakdown is presented on result views rather than cluttering the leaderboard.


## v25 score-format/theme refinement — 2026-09-28
- Student theme toggle is available before, during and after a CBT and persists separately from the administrator theme.
- Single-section overall scores and multi-section aggregate scores display as `earned / total`; multi-section subject/section breakdowns display earned marks only.
- Leaderboards display the overall earned/total score and percentage; subject breakdowns are not shown on the leaderboard.
- Display scores are rounded to whole marks for readability; stored attempt scoring remains precise.
- Official leaderboard branding uses a centered light logo plaque on dark headers and adds deliberate spacing between the title block and the results table, including exported PNG posters.


## v25 final verification — 2026-09-28
- Browser/DOM regression suite: 28 checks passed, covering single- and multi-section score formatting, student theme controls, quiz-state preservation during theme switching, official leaderboard hierarchy, zero-score row handling and attempt-ID retention, mobile leaderboard spacing/contrast, question-selection scroll preservation, builder-selection scroll preservation, and the leaderboard export pipeline.
- Generated official leaderboard poster was validated as a PNG (1280×1150) and visually inspected for centered branding, readable logo, title spacing and normal numeric rank rendering.
- Static package audit passed for the exact 14-file production inventory, JavaScript/Python syntax, HTML local references, CSS parsing, image integrity, frontend/API action parity, database RPC references and cache/build identifiers.
- Local mock API and static HTTP checks passed with a multi-subject result fixture using an overall `82 / 100` score and plain subject breakdown scores.
- Live Supabase/EdgeOne database transactions were not executed in this environment, so production deletion and submission were not claimed as live-tested.


## v26 student diagrams + tab-switch warning — 2026-09-28

- Fixed the student CBT diagram rendering path: on-demand question images returned by `question-media` are now written back to the active public question object and rendered from the student image cache on every re-render. This applies generically to all published CBTs that have `image_data`.
- Added a visible loading state and resilient failure state for question diagrams so a diagram fetch cannot break question navigation.
- Reworked the student tab-switch guard to detect actual document visibility changes during an active CBT, record the event, and require an explicit choice after the student returns: **Return to Exam** or **Forfeit Exam**. Switching away no longer silently auto-submits the attempt.
- Removed the window `blur` handler from the tab-switch enforcement path to avoid treating normal focus changes such as browser chrome interaction as an exam tab switch.
- Added dark/light styling for the diagram frame, loading state, and tab-switch decision dialog.


## v26 final audit status — 2026-09-28

- JavaScript syntax: **PASS** (`app.js`, `edge-functions/api/index.js`).
- Python syntax: **PASS** (`test_server.py`).
- HTML structural check: **PASS**; no mismatched tags or unresolved local asset references.
- CSS structural check: **PASS**; balanced braces/parentheses and v26 selectors present.
- SQL lexical/balance checks: **PASS** for `schema.sql`, `schema_repair.sql`, and `schema_cbt_libraries_migration.sql`.
- Frontend-to-API action coverage: **PASS**; every frontend API action has a corresponding API route.
- Duplicate top-level function scan: **PASS**; no duplicate classic function declarations in the main frontend/API files.
- Student diagram regression logic: **PASS**; cached `question-media` responses are rendered and persisted on the active question object.
- Tab-switch regression logic: **PASS**; a real document visibility change records one violation, does not auto-submit, and presents explicit **Return to Exam** / **Forfeit Exam** choices on return.
- Asset integrity: **PASS**; official logo PNGs open and verify successfully.
- Production package hygiene: **PASS**; no Python cache, browser harness, or screenshot artifacts are included in the final production ZIP.

A live Supabase/EdgeOne transaction was not executed in this environment. Headless Chromium was also not usable for a reliable live DOM smoke test here, so browser-runtime claims are not represented as live-production verification.


## v27 full audit hardening — 2026-09-28

- Final hardening: existing oversized question diagrams are preserved during unrelated question edits, explicit diagram removal now correctly clears image data, SVG data-URI validation is aligned across the browser/API/full schema, and published CBT image availability falls back to on-demand media loading if the lightweight image-ID lookup is temporarily unavailable.
- Student question-media accepts safe PNG/JPEG/GIF/WEBP/SVG data URIs and a larger on-demand payload budget so legacy diagrams are not silently omitted from the student CBT.
- AI/document-import diagrams are compressed client-side before save when they exceed the stored-image budget.
- Student correction review can load diagrams on demand instead of embedding every diagram in the submission response.
- The result-access correction path now carries diagram-availability metadata and preserves passage content.
- Current frontend/API build identifier: `v29-colors-feedback-20260929`.
- Full package audit rerun after these changes; live Supabase transactions and reliable live Chromium smoke testing remain environment-limited.


### v29 Student Feedback
The updated Hub adds a post-test student feedback/complaint form and an administrator Student Feedback page. Existing deployments must run the updated `schema_repair.sql` (or the full `schema.sql`) so the `student_feedback` table exists before the feature is used.


## v42 export and rank-neutrality update — 2026-10-02
- Replaced the previous leaderboard PNG podium/poster composition with a completely different landscape institutional-results bulletin format.
- Export uses a clean header, summary metrics and table; there is no podium, medal treatment or special first-place colour.
- Removed the brown/gold first-row highlight from on-screen official leaderboards; ranks are presented as neutral numeric values.
- Frontend cache-busting advanced to v42.


## v46 — student UX, first-attempt leaderboard and private CBT libraries

### Student interface
- The static loading screen is replaced by a subtle animated Gifted Brainz emblem and progress indicator for both `Loading CBT` and `Loading CBT Library`. Reduced-motion preferences are respected.
- The student CBT answering screen displays the generic `CBT Environment` label instead of the CBT's title. It no longer displays total question counts in the section tabs or question header, nor the question-format/marks label beside the question number.
- The WhatsApp channel card is more compact on mobile devices and remains balanced on laptop/desktop layouts.
- Student loading, access-denied and private-library activation screens have responsive styling and dark-mode support.

### Leaderboard policy
- Leaderboards now use each device's first submitted attempt, ranked by the score earned on that attempt. Later submitted attempts do not overwrite that leaderboard entry. This policy is applied to public/student, shared-result and administrator leaderboard construction.
- Students may still retake a CBT when its attempt settings permit; their later result can be displayed for that attempt, but the leaderboard keeps the first submitted result.

### Public/private library access
- Each CBT Library has an administrator-controlled `Public` or `Private` access mode.
- A public library remains available to anyone with its link. A private library requires device activation.
- When access is denied, the student sees: `You are not eligible to open this library. Contact the administrator for more details.` The current browser's device ID is shown with a copy button and an activation-code field.
- An administrator can enter a device ID from the library's Manage dialog and generate a one-time activation code. The code is tied to the selected library and exact browser/device ID, is stored as a hash, and expires after seven days. Successful activation consumes the code and enables that device for that library.
- Private-library checks are enforced in the server API for library loads, individual CBT links, question media retrieval and CBT attempt starts. A direct CBT URL cannot bypass the private-library access check.
- The database migration creates `cbt_library_device_access` with RLS enabled and no public-client policies. The EdgeOne API uses the server-side Supabase Secret/Service Role key.

### Deployment steps for this build
1. Back up the current production files and database as part of your normal deployment process.
2. In the Supabase SQL Editor, run `schema_private_cbt_libraries_migration.sql` for an existing database. Fresh installations can instead run the updated `schema.sql`.
3. Deploy the updated static files and `edge-functions/api/index.js` together. Keep the Supabase secret and admin/session variables server-side.
4. Hard-refresh the site on the browser/device and sign in as administrator. Existing libraries default to `Public` until you change them to `Private` in Manage Library.
5. To activate a device, open Manage on the private library, paste the device ID supplied by the user, generate a code and share it with that user. The user opens the private link on that same browser, enters the code and activates access.
6. Test the public link, private link on an unapproved browser, activation on the approved browser, and a direct individual CBT link on an unapproved browser.

**Device-ID limitation:** the device identifier is a random identifier stored in that browser's local storage, not a hardware-backed identity. Clearing browser storage, using a different browser/profile or switching devices may produce a new identifier and require a new activation. This is practical application-level access control; it is not hardware attestation.


## v46.0.1 audit and access-control corrections — 2026-10-16
- Added a device/library authorization check to the CBT submission/retry endpoint. A copied or retained attempt token can no longer use the `attempt` endpoint to retrieve corrections/results from a private CBT without an authorized device ID.
- The student client now sends its device ID with submission retries as well as on quiz loading, media, attempt start, leaderboard, result access and activation requests.
- Kept first-submitted-attempt leaderboard selection aligned between the public, result, and administrator data paths. Result rank now resolves to the participant's first-attempt leaderboard entry even when the result page is showing a later retake.
- Added `tests/private-library-regression.mjs`; `npm test` runs 13 mocked API regression checks for public/private access, activation-code authentication and use, device binding, single-use activation, first-attempt leaderboard behavior, and private result/submission bypasses.
- Validation completed: JavaScript and Python syntax, frontend-to-API action coverage, HTML parse, CSS parse (zero top-level errors), and ZIP integrity. Browser-based visual smoke testing and live Supabase/EdgeOne transactions were not available in this environment; perform the documented post-deployment checks before using the private-library control in production.
- Device IDs remain browser-local identifiers rather than hardware-backed identities. The service enforces the ID that the browser presents, but a technically capable user can spoof a client-provided ID. Do not treat this mechanism as hardware attestation or as a substitute for authenticated user accounts when stronger identity assurance is required.

## v47 — Question Pools — 2026-10-20

Implements the "Proposed Question Pool Management System" spec: administrator-managed, named
pools of topics that students browse as a reusable learning resource (distinct from a single
timed CBT), with Study Mode and Practice Mode.

**Migration required.** Run `schema_question_pools_migration.sql` (or the updated `schema.sql`,
which contains the same block) in the Supabase SQL editor before deploying this build. It adds
`question_pools`, `pool_topics`, `pool_device_access`, `pool_practice_attempts`,
`pool_practice_answers`, `pool_study_progress`, and two nullable columns (`pool_id`, `topic_id`)
on the existing `questions` table.

**Design choice — reuse, not duplication.** A pool question is a normal row in the existing
`questions` table (the same one used by CBTs and the Question Bank) with `quiz_id`/`section_id`
left `null` and `pool_id`/`topic_id` set instead. This means the existing question editor, Groq
AI Question Studio, document/PDF import pipeline, image compression/storage, and KaTeX math
rendering all work for pool questions without any changes to those systems.

**What was added:**
- **Admin → Question Pools** page: create/rename/delete pools, toggle Public/Private access,
  copy the pool's shareable link, add/rename/delete topics within a pool, and see each topic's
  live question count.
- **Topic question management:** open any topic to add questions manually, generate them with
  the AI Question Studio, or import them from a document — all saved straight into that topic.
  Edit or delete any pool question from the same screen.
- **Public pool link** (`?pool=<slug>`): students see the pool's topics with per-topic question
  counts, a Select All option, and a choice of Study Mode or Practice Mode — matching the spec's
  "Choose Your Topics" checklist.
- **Private pools** reuse the exact device-ID + one-time activation-code mechanism already used
  by Private CBT Libraries (same gate UI, same server-side enforcement, same 7‑day code expiry).
- **Study Mode:** untimed; the server grades each answer immediately and returns the correct
  answer and explanation right after the student responds (never sent in bulk ahead of time);
  progress (position, answers, flags) is saved per device and resumed automatically.
- **Practice Mode:** timed and exam-style; students may optionally choose how many questions
  (sampled and shuffled from the selected topics) and the time limit; scoring happens
  server-side from the stored correct answers (never trusting client-submitted scores), with a
  full post-submission review.
- Needs-review questions (flagged by AI generation/import as low-confidence) are excluded from
  what students can study or practise until an administrator clears the flag by editing them.

**Not implemented in this pass** (noted so it isn't mistaken for an oversight): drag-and-drop
reordering of topics; moving/copying a question between topics or pools from the UI (the data
model supports it — reassign `topic_id`/`pool_id` — but no dedicated control was built);
pool-level analytics/leaderboards beyond the per-session Practice Mode result screen; answer
*option* shuffling for pool questions (CBTs already support this; pool questions currently show
options in a fixed order, while question *order* is still randomized per the spec).

**Validation performed in this environment:** `node --check` on `edge-functions/api/index.js`,
and a full parse of `app.js`, plus a cross-reference of every `onclick`/`onchange` handler and
every `window.x = x` export against its function definition. This sandbox has no network access,
so no live Supabase/EdgeOne/Groq run was possible — follow the existing "End-to-end test" and
"Admin sign-in diagnostics" sections above after deploying, and spot-check: creating a pool,
adding a topic, adding one manual question, generating a few with AI, opening the public link,
completing a Study Mode question, and running a full Practice Mode session end to end.

## v47.1 — submission reliability and leaderboard coverage — 2026-10-20

**Root cause found.** The leaderboard and the "first attempt" result logic only ever count
attempts with `status = 'submitted'`. Previously, if the final `attempt` submission request
failed (lost connection, closed tab, server hiccup) the student's exam view silently showed a
toast and resumed the exam — the attempt stayed `started` forever, so the student's score was
in the database but permanently excluded from the leaderboard. Worse, if the CBT's max-attempts
setting was `1`, that stuck `started` row also blocked the student from ever starting a fresh
attempt (`attempt-start` counted it as "already used").

**Fixes:**
- **Visible submission status.** Submitting now shows a dedicated "Submitting your attempt…"
  screen (manual submit, time-up auto-submit, and the tab-switch violation auto-submit all go
  through it) instead of silently continuing the exam in the background.
- **Automatic retry, then a tap to retry.** On failure the client retries the same submission
  automatically a few times with a short backoff; if it still fails, the screen shows the error
  and a **Try Again** button, plus a **Start over instead** option if retrying is hopeless (e.g.
  the session has genuinely expired).
- **Survives a closed tab or crash.** Before each submit attempt, the answers, violation count
  and attempt credentials are saved to this browser's local storage. If the page is closed and
  reopened before the submission ever succeeded, reopening the same CBT link now resumes and
  finishes that exact submission automatically, rather than losing it or starting a duplicate
  attempt.
- **Submission is safe to retry.** The server's `attempt` endpoint was already idempotent — a
  repeat submission for an attempt that's already `status = 'submitted'` returns the stored
  result instead of re-scoring — so the new retry logic cannot double-submit or corrupt a score.
- **Server-side attempt-limit fix.** `attempt-start` no longer counts a `started` attempt that
  is past its time window plus grace period against the device's attempt limit, so a genuinely
  abandoned/stuck attempt can no longer permanently lock a student out of a single-attempt CBT.

No leaderboard query logic changed — every `submitted` attempt was always being shown. This
release is about making sure attempts reliably *reach* `submitted` status in the first place, so
every student who actually completed the CBT appears on the leaderboard.

## v47.2 — Question Pool performance, modal freeze, and bulk move — 2026-10-21

**Critical bug fixed: the "blinking"/frozen topic screen.** Opening a topic (Manage Pool → Open
topic) re-fetched its questions from the server, then re-rendered the modal — and that
re-render unconditionally triggered another fetch, forever. This was a genuine infinite
fetch-and-redraw loop: the screen kept flashing and no click could register because a new
render was already in flight. It's fixed by only fetching a topic's questions once per time the
topic is opened (cached in memory, cleared only when something actually changes).

**Why Question Pools felt slow in general.** Nearly every pool action — creating a pool, adding
or renaming a topic, deleting a topic, saving or deleting a question — was calling the same
full `bootstrap` reload the rest of the admin panel uses, which re-fetches *every* CBT, the
entire question bank, every attempt, every library, and every pool, just to reflect one small
change. These actions now update the pool/topic/question data already in memory directly from
each save's own response, with no reload at all. Creating a topic or saving a question should
now feel instant.

**New: bulk-move questions between topics.** Opening a topic now shows a checkbox per question,
a "Select all" checkbox, and — once anything is selected — a bar with a "Move to topic…" picker
(any other topic in the same pool) and a Move button. This calls a new `pool-questions-move`
action that validates every selected question belongs to that pool, then moves them all in a
single request. Moving is restricted to topics within the same pool (moving between pools isn't
offered, since that would silently detach a question from the pool it was written for).

**Also fixed in passing:** renaming a topic no longer reports its question count as `0` in the
API response (the client never used that value, so this wasn't user-visible, but it was wrong).

## v47.3 — shareable results — 2026-10-21

There was no active screenshot-blocking in this app (no capture-prevention CSS/JS was ever
added), so nothing was actually stopping a student from taking a screenshot. What was missing
was an easy way to *share* a result as a clean image, so this adds that directly.

**What was added:** a **"📤 Share / Screenshot Result"** button on:
- The CBT result screen (only shown when that CBT's result display is turned on).
- The Question Pool Practice Mode result screen.

Tapping it renders just the score card (logo, score, pass/fail, stats — not the action buttons
or the full question review) to a PNG image using `html2canvas` (loaded from jsdelivr, pinned at
`1.4.1`, the same CDN already used for KaTeX). On a phone with share-sheet support
(`navigator.share` with file support — most modern mobile browsers), it opens the native share
sheet so the student can send the image straight to WhatsApp, Instagram, etc. Everywhere else it
downloads the PNG so the student can share it manually. If image generation fails for any reason
(e.g. the CDN script hasn't loaded yet), it tells the student a plain screenshot works fine too.

No backend change was needed for this — it's a client-side rendering feature only.

## v47.4 — topic list layout fix — 2026-10-21

**Found the cause of the stacked Open/Rename/Delete buttons** (screenshot: each topic card had
its three action buttons stacked in a tall column instead of sitting in one row). The topic row
reused the `.library-pick` class, which has a rule — `.library-pick span{display:flex;
flex-direction:column}` — written for a different, single-span layout elsewhere. The button
group's inline `style="display:flex;gap:8px"` didn't re-declare `flex-direction`, so the
stylesheet's `column` direction still won and the buttons stacked.

**Fixed by giving topics their own layout** instead of reusing that class: each topic is now a
compact card (name, question count, then Open/Rename/Delete in one even row) laid out in a
responsive grid — two or three per row depending on screen width, instead of one full-width row
per topic. This is the same spirit as the CBT Library cards (actions together in one row, topics
shown compactly) adapted for the fact that, unlike a library's CBT list, each topic needs its
own Open/Rename/Delete rather than one set of actions for the whole list.

## v47.5 — share-result feature removed — 2026-10-21

The v47.3 "Share / Screenshot Result" feature (html2canvas-generated image + native share
sheet) has been removed at the user's request — a plain screenshot is enough and was never
blocked in this app to begin with. Removed: the html2canvas script tag, the share button on
both the CBT result screen and the Question Pool Practice Mode result screen, and the
`shareResultImage`/`shareCbtResult`/`sharePoolResult` functions. No other v47.x changes were
affected.

## v47.6 — Question Pool progress, non-repeating practice cycling, and recommendations — 2026-10-21

**Migration required.** Run `schema_pool_progress_migration.sql` (or the updated `schema.sql`)
before deploying this build. It adds `pool_progress`, `pool_question_exposure`, a `cycle` column
on `pool_practice_attempts`, and a new Postgres function `gb_record_pool_exposure_v1` that
atomically increments per-question seen/correct counts (used by both Study and Practice Mode so
concurrent answers never race each other).

**How it works — the "cycle".** A cycle is one full pass through every eligible question in a
pool. The server tracks, per device and per question, which cycle it was last answered in. When
a student starts a new Practice Mode session:
- It samples only from questions **not yet seen in the current cycle**, across the topics they
  selected — so back-to-back practice sessions keep surfacing different questions instead of
  repeating ones already done.
- If fewer unseen questions remain than the requested count, it fills the rest from the
  already-seen ones (so a session is never short).
- Once a device has seen every eligible question in the selected topics at least once, the
  *next* session automatically starts a new cycle and the full set becomes available again —
  "exhaust the bank, then start over," as asked for.

Study Mode questions also count toward exposure (every answer is recorded the same way), so
reading through a topic in Study Mode contributes to "percent solved" even without using
Practice Mode.

**What students now see:**
- Each topic on the topic-selection screen shows a progress bar and "X% solved" for the
  **current cycle** — not just how many questions exist, but how much of that topic the student
  has actually gotten to.
- An overall progress card ("Cycle N • X% correct overall") appears once a student has answered
  at least one question in the pool, with a plain-language recommendation based on lifetime
  accuracy: ≥80% → move on / light recap; 60–79% → revisit missed questions, practice again;
  40–59% → switch to Study Mode to read explanations, then practice again; <40% → focused
  revision in Study Mode before practicing again. This appears both on the topic-selection
  screen (refreshed every time a student returns from Study or Practice Mode) and right on the
  Practice Mode result screen, since that's the natural "I just finished" moment.

Recommendation thresholds are a reasonable starting point, not a pedagogical standard — they're
easy to retune in one place (`poolRecommendation` in `edge-functions/api/index.js`) if you want
different cutoffs or wording.

## v47.7 — Question Pool exit bug fixed, WhatsApp contact-administrator button — 2026-10-22

**Fixed: exiting a Question Pool dropped students into the admin console.** `poolExit()`
cleared `state.studentPool` entirely, so the app's render logic fell through to the admin
dashboard/login screen — exactly backwards for a student-facing link. "Exit" now returns the
student to that same pool's topic list (what `poolBackToTopics()` already did correctly), never
leaves the pool page, and never touches the admin console. Buttons that said "Exit" now read
"↩ Back to Topics" to match; the redundant second "Exit" button on the Practice result screen
(next to the already-correct "Choose topics again") was removed.

**New: "Contact Administrator on WhatsApp" button**, added to both the Private CBT Library gate
and the Private Question Pool gate, right under the student's device ID. Tapping it opens
WhatsApp with a message pre-filled for the administrator:
> Hi Gifted Brainz Tutorial, I want to activate my device for the CBT Library/Question Pool
> "⟨name⟩". My device ID is ⟨deviceId⟩.

so the student doesn't have to type or copy anything — the right item name and device ID are
already in the message.

**Action required before this is usable:** the WhatsApp number is a placeholder —
`WHATSAPP_ADMIN_NUMBER` near the top of `app.js` is currently `'2348000000000'`. Replace it with
the real Gifted Brainz support number (international format, digits only, no `+`) before
deploying, or the button will open WhatsApp to a number that doesn't exist. There was no admin
contact number anywhere in the existing codebase to reuse, so this had to be added as a new,
easy-to-find constant rather than pulled from existing configuration.

## v47.8 — question corrections now update student scores, graphics fixes

**Migration required.** Run `schema_question_correction_migration.sql` on an existing Supabase
project (or use the updated `schema.sql` for a fresh install). It adds a single new function,
`regrade_attempt_atomic`.

**The problem:** if a question's answer key was wrong (e.g. a student reported it) and the admin
corrected it after students had already submitted the CBT, nothing re-scored those existing
attempts. A student's "View Corrections" screen would even show the *new* correct answer
highlighted, while their actual score, percent, pass/fail status and leaderboard position stayed
based on the old, wrong answer key — visibly inconsistent.

**The fix:** `question-save` now detects when an edit to a question that belongs to a CBT changes
either the marked correct answer or the mark value. When that happens, every already-submitted
attempt for that CBT is immediately re-scored against the corrected question data (same scoring
rules the CBT normally uses, including equal-marks distribution and per-section mark allocation)
via the new `regrade_attempt_atomic` function, updating `attempts.score/total/percent` and each
affected `attempt_answers` row. The admin console now reports how many student scores were
recalculated after saving the correction (e.g. "Question updated — 12 student scores
recalculated"). This only touches CBT questions with existing submitted attempts; editing a
Question Bank/Question Pool item that isn't attached to a CBT, or a question nobody has taken yet,
has no attempts to regrade and behaves as before.

**Graphics fixes:**
- **Question Pool topic question rows** (`Manage a Question Pool topic → Questions` list): the row
  layout expected the checkbox and question text to be one combined block, but the markup kept
  them as separate grid cells. That mismatch stretched the lone checkbox into a wide, mostly-empty
  box and left the Edit/Delete buttons misaligned against wrapped question text. The checkbox and
  question text are now grouped together and the action buttons stay aligned to the top of the row
  even when the question text wraps to two lines.
- **Topic pill lists** (CBT Libraries and Question Pools cards): kept the flat pill layout but gave
  it more breathing room — slightly larger pill padding and more vertical space between wrapped
  rows of pills, so the lists feel less cramped.

## v47.9 — Question Pool save 502 fixed, document extraction raised to 200

**Migration required.** Run `schema_pool_bulk_save_migration.sql` on an existing Supabase project
(or use the updated `schema.sql` for a fresh install). It adds one new function,
`gb_save_pool_questions_v1`.

**The 502 on "Save to Question Pool":** saving AI-generated or document-extracted questions into a
Question Pool topic was inserting them one row at a time, in a loop — up to 200 separate sequential
requests to Supabase for a single save. That's slow and fragile: any one transient hiccup, or simply
the loop running long enough to hit a gateway timeout, surfaced as `Supabase questions request
failed at supabase (HTTP 502)`, and whatever had already been inserted before the failure was left
stranded (no easy way to tell what saved and what didn't). This now goes through one atomic
bulk-insert database function — the same proven pattern already used for saving AI questions into a
CBT — so an entire batch is saved in a single round trip, all-or-nothing. CBT question saving was
not affected by this bug and is unchanged.

**Document extraction capped below 200:** extracting questions from an uploaded document was
reusing the "Number" field from the separate "Generate questions" panel (default 10) as its target
count, so unless an admin happened to bump that unrelated field up to 200 first, extraction silently
capped out far below the system's actual 200-question maximum. Document extraction now always
requests the full 200-question ceiling regardless of that field — it still only returns however many
questions are actually in the document, it just no longer artificially caps out early. The per-request
token budget sent to Groq was also raised (12,000 → 40,000, comfortably inside the model's 65,536
limit) so larger batches have enough room to be returned in full rather than getting cut off.

## v47.10 — bulk delete for Question Pool topic questions

**Migration required.** Run `schema_pool_bulk_delete_migration.sql` on an existing Supabase project
(or use the updated `schema.sql` for a fresh install). It adds one new function,
`delete_pool_topic_questions_bulk`.

A Question Pool topic's question list already supported selecting multiple questions (for the
"Move to topic…" action), but had no way to delete a selection in one go — only one-by-one via each
row's own Delete button. Selecting questions in a pool topic now also shows a **"🗑️ Delete
selected"** button next to Move/Clear, which removes every selected question (and any passage left
orphaned by the deletion) in a single request, scoped to that topic only — mirroring the bulk-delete
already available in the Question Bank and the CBT Question Builder.

## v47.11 — Question Pool "Add/Edit Question" form no longer wipes itself on diagram add/remove

Adding or removing a diagram image in the Question Pool's Add/Edit Question form was calling a
full re-render of the entire form — which rebuilds it from the question's last-saved data, not
whatever you currently had typed in the boxes. So attaching an image would visibly reset the
question text, options and explanation back to whatever they were before you started editing (or
blank, for a new question), which is exactly the "refreshing" behaviour reported. This now matches
how image upload already worked correctly in the CBT Builder's question form: adding or removing a
diagram only updates the image preview itself in place, and leaves the rest of the form exactly as
you left it.


## v48.0 — private individual quizzes and 500-question batch saving — 2026-10-29

### Question-save capacity
- Increased the `ai-save-batch` server validation, browser-side save guard, and both atomic SQL bulk-save functions from 200 to 500 questions per save.
- The UI and backend now report the matching 500-question maximum. AI generation/extraction request limits remain separate from the save-batch cap.

### Private quizzes
- A quiz can now be set to `Public` (anyone with its link can start) or `Private` (activation code required), independently of CBT Library and Question Pool settings.
- A student opening a private quiz sees an access gate with the generated browser Device ID and a WhatsApp contact button. The administrator's WhatsApp number is maintained in Platform Settings and is not printed on the student screen.
- The administrator can register a Device ID in the quiz editor and generate a one-time, device-bound activation code. Codes are stored as hashes, expire after seven days if unused, and only activate the quiz to which they were issued.
- The quiz editor lists activated devices; revoking a device removes that quiz's access immediately. Quiz-level access is enforced by the server for quiz loading, question media, attempt start/submission, result access, leaderboard and feedback routes.
- Existing quizzes default to `Public` during migration; existing private-library and private-pool controls remain independent.

### Existing database upgrade / deployment
1. Back up the production files and database.
2. In Supabase SQL Editor, run `schema_private_quizzes_migration.sql` and `schema_question_save_limit_500_migration.sql` (both included in this release ZIP). For a fresh database, use the updated `schema.sql` instead of the incremental migrations.
3. Deploy the updated static files and `edge-functions/api/index.js` together. Keep Supabase credentials, `ADMIN_PASSWORD`, and `SESSION_SECRET` on the server.
4. Sign in as administrator, open **Platform Settings**, and confirm the WhatsApp number. Open **Quiz Management → Edit Quiz**, set **Quiz access** to **Private**, save, then reopen the quiz to manage device activation.
5. Test a public quiz, a private quiz on an unapproved browser, successful activation on the registered browser, and immediate access revocation.

**Device-ID limitation:** the Device ID is browser-local storage, not a hardware-backed identity. Clearing site storage or using another browser/profile produces a different ID and may require a new activation.

---

# v50.0 — Brainz Biltz audit fixes and hardening

Brainz Biltz adds a dedicated, shareable, scheduled challenge experience to Gifted Brainz Assessment Hub. Challenges are created from the administrator dashboard, but students enter through a direct URL such as `https://YOUR-DOMAIN/?biltz=biology-blitz-xxxxx` and do not need to browse the admin/dashboard interface.

## Included in this release

- A new **Brainz Biltz** administrator section to create, edit, publish, pause, cancel, or archive shareable challenges.
- Each challenge uses a published CBT and gets its own unique link.
- Configurable challenge opening and last-start times, per-attempt duration, attempt limit, participant capacity, and deadline policy.
- Public/private access and free/paid entry configuration. Paid challenges use manual payment verification in this release; this page does not collect payment itself.
- Participant registration and an administrator participant panel for approving, rejecting, or revoking entries.
- A navy, gold, and electric-blue landing page with aura rings, glow orbs, drifting particles, a live countdown, and animated entry CTA. Reduced-motion preferences are respected.
- A challenge-specific examination launch flow, server-side schedule and access checks, auto-scoring, progress recovery, configurable review and leaderboard publication, and participant rankings.
- Challenge-only link protection when selected. Once a challenge-only CBT is linked to a published Brainz Biltz challenge, the ordinary CBT URL cannot be used to bypass its challenge entry window.
- A privacy check on private challenge leaderboards; only an administrator or approved participant can access them.
- Regression checks for the pre-existing private Library/Quiz and 500-question save-limit features, plus new Brainz Biltz regression checks.

## Database deployment

### Existing Supabase installation

1. Back up the database as you normally would before deploying schema changes.
2. Run `schema_brainz_biltz_migration.sql` in the Supabase SQL Editor.
3. Deploy `edge-functions/api/index.js` and the updated frontend together: `index.html`, `app.js`, and `styles.css`.
4. Confirm the health endpoint reports the new `brainz_biltz_challenges`, `brainz_biltz_participants`, and `brainz_biltz_attempts` tables as available.
5. Sign in to the dashboard, open **Brainz Biltz**, and create a draft challenge using a published CBT.
6. Preview the challenge, set its schedule/access/price, then publish it and copy its shareable link.

### Fresh database installation

Use `schema.sql`, which includes the Brainz Biltz tables alongside the application's existing schema.

Do not deploy the new frontend without the matching server function and database migration: the challenge schedule, approved status, attempt limit, question delivery, and result ranking are validated by the server.

## Creating a challenge

1. Publish a CBT first under Quiz Management.
2. Open **Brainz Biltz → Create Challenge**.
3. Add the challenge title and description, select the published CBT, and configure the start time, last time to start, examination duration, fee, access mode, attempt limit, participant capacity, and result settings.
4. For a paid challenge, enter payment instructions. The administrator reviews payment references in the Participants panel and approves access after confirming payment through the external payment channel.
5. Set the status to **Published**, save, and use **Copy Link** to share it.

All schedule fields are entered/displayed in West Africa Time (WAT). The server enforces actual timestamps; the participant's device clock cannot open a challenge early.

## Regression and verification

Run:

```bash
npm run check
npm test
```

The test command includes the existing private-library regression suite and `tests/brainz-biltz-regression.mjs`. These tests check syntax, route presence, schema constraints, administrator gates, challenge access/timing controls, token-bound question delivery, shareable URL generation, aura styling, and reduced-motion support.

The implementation has not been applied to a live Supabase project as part of this package build. Execute the migration and run a real deployment smoke test before sharing live challenge links. Paid entry is manual verification only in this release; no automatic payment collection is included.

## v50.0 audit corrections

This release follows v49 and corrects several issues found during a focused logic/security review:

- Ordinary CBT result slugs and personal result tokens now obey the Brainz Biltz challenge-only gate.
- Brainz Biltz personal results use the linked challenge's review, leaderboard, attempt-limit, and result-release settings, rather than exposing the underlying CBT's broader result/leaderboard data.
- Private challenge result tokens are bound to the registered participant device.
- The general leaderboard API returns challenge-scoped rows when called with a challenge link instead of mixing other attempts from the source CBT.
- Existing token-bound attempts can recover/submit after a challenge pause/cancellation/archive, while new entries remain unavailable.
- Editing an already-registered challenge now reads all locked fields and compares timestamps/numeric values correctly. It permits descriptive updates but rejects changes to the CBT, schedule, entry fee, access mode, attempt/participant limit, and finish policy after registration begins.
- Paid or private challenges cannot disable the ordinary-CBT link gate.
- Immediate submission feedback uses the challenge's configured review and leaderboard flags, and shared result links point back to Brainz Biltz instead of the ordinary CBT URL.

The audit does not change the Brainz Biltz SQL schema, so this release does not require rerunning `schema_brainz_biltz_migration.sql` when it has already been successfully applied. If it has not been applied yet, run it before deployment.

