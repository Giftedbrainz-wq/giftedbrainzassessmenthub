# QA Report — Gifted Brainz Assessment Hub v46.0

- JavaScript syntax: PASS
- Python test server syntax: PASS
- Stale v31 asset references in index.html: PASS (none)
- Contrast hardening block present: PASS
- Dark confirmation modal rules: PASS
- Generated preview contrast rules: PASS
- Gold-button metadata contrast rules: PASS
- Leaderboard contrast rules: PASS
- Public library contrast rules: PASS
- Release archive integrity: PASS after packaging

## Historical v45 result and leaderboard behavior — 2026-10-02 (superseded by v46 below)
- CBT submission requests are retried once at the browser layer because the `attempt` endpoint is idempotent after a successful submission. This protects students from a lost response after Supabase has already stored the score.
- Leaderboards no longer exclude later retakes by filtering to `attempt_no=1`. They now show the latest submitted attempt for each device/participant, so a student's completed score can update the leaderboard.
- Admin, student/public and shared-result leaderboard construction were aligned to the same latest-submission rule.
- Submitted attempts now receive a private `result_token`; a student result can be recovered with a personal result link instead of depending only on the quiz-wide, device-bound result slug.
- The CBT landing page can surface a previously saved result on the same browser once results have been released.


## v46.0 private-library and student-experience update — 2026-10-15
- `node --check app.js`: PASS
- `node --check edge-functions/api/index.js`: PASS
- First-submitted-attempt selection is used in student/public, shared-result and admin leaderboard builders.
- Student CBT question screen no longer renders CBT title, total question count in the tab/header, question type, or marks metadata.
- Animated student loading treatment is shared by CBT and CBT Library entry points; mobile channel sizing and private-access screens have dedicated responsive styles.
- API checks private library membership and device activation before serving an individual quiz bundle, question media or starting an attempt.
- Device activation codes are hashed in storage, expire in seven days and are consumed on successful activation.
- Database schema and migration files include `access_mode` and the device-access table with RLS enabled.
- Live Supabase/API integration test: NOT RUN in this local ZIP review because no production credentials/database endpoint are available in the workspace. Run the documented migration and end-to-end access checks before production use.
- Mocked API handler smoke tests: PASS for public library access, unauthorised private-library denial/message, individual CBT-link denial, valid device activation, first-attempt leaderboard selection, and administrator-only device-code generation that stores only the SHA-256 code hash.

- Admin library UI labels the device workflow as “Register device & generate activation code” to make the combined registration/code action explicit.


## v46.0.1 audit correction — 2026-10-16
- `npm run check`: PASS (frontend/API JavaScript syntax and Python test-server syntax).
- `npm test`: PASS — 13/13 mocked API regression checks, including a new case that blocks private CBT result/correction retrieval through the `attempt` submit/retry endpoint when the request device is not approved.
- Device activation tests: PASS — admin auth required, activation code stored only as SHA-256 hash, wrong-device activation denied, correct activation succeeds, successful activation consumes the code, and replay is denied.
- Leaderboard: PASS — later retakes do not replace first submitted result.
- Frontend/API action coverage: PASS (40 frontend literal actions found no missing API route).
- HTML structural parser: PASS; CSS parser: 0 top-level parse errors; ZIP integrity: PASS.
- Attempt endpoint access-control gap found during this review and fixed. The API now checks current private-library authorization before returning submission results/corrections, and the browser sends the device ID on submission/retry requests.
- Browser visual tests could not be completed because the local browser runner was blocked by the execution environment. Live Supabase and EdgeOne deployment tests were not run. Do not infer production connectivity from the mocked API tests.
