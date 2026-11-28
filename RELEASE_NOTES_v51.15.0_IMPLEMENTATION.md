# GIFTED BRAINZ ASSESSMENT HUB — v51.15.0

## Implementation summary

- Fixed a confirmed `isUuid is not a function` crash in the public CBT route: the request-local Boolean `isUuid` had shadowed the global `isUuid()` identifier checker. Renamed the local Boolean, preserving secure route validation.
- Candidate-name UX: previously stored candidate name is displayed on the exam welcome screen, reused for future CBTs and can be edited. Other required student details remain per-CBT.
- Leaderboard now includes elapsed time at both podium and lower ranking levels, with premium navy, gold, subtle glow and mobile-responsive styling. Existing score-then-time sorting is retained.
- Daily Challenge has Type Your Answers and Snap & Send modes. Camera/gallery input provides instructions about clear handwriting, previews the photo, and converts it to a reasonably sized JPEG. Vision AI transcribes only legible content, marking `[UNREADABLE]` where needed. Normal AI marking is requested automatically after submission. The official result and marking remain concealed until the scheduled result release, exactly as for typed answers. Original photos are stored in a PRIVATE Supabase Storage bucket and accessible through an authenticated admin-only endpoint. Deleting a Daily Challenge also attempts to remove its corresponding privately stored photographs.
- Admin CBT listing includes a search input and status filter; CBT Library admin picker and student-facing CBT Library have instant title/description search.
- A new result-token- and device-bound backend API generates and caches topic-specific AI revision from the learner's incorrect, stored answers and explanations. Existing deterministic weak-topic reports remain available even if the provider is offline. Generated explanations should still be checked by students.
- Reduced question text and option sizes slightly while preserving math readability; auto-next after 550 ms on standard CBT and Question Pool practice questions only. The final question is never auto-submitted; study mode keeps answer feedback in place.
- Mathematical AI question generation instructions now require answer/explanation verification and better mathematical notation; a syntax validator rejects malformed fractions/braces/delimiters before saving generated batches (not a mathematical proof of correctness).
- Admin schedule countdown has a continuous second-by-second update and refreshes schedule state when opening/closing passes; student scheduled CBT countdown continues without manual refresh.
- Daily Challenge welcome is redesigned with official `assets/icon.png` with clear GIFTED BRAINZ wordmark instead of the plain GB monogram, improved metadata hierarchy and tasteful navy/gold styling.

## REQUIRED deployment steps

1. Back up the current deployed code and Supabase database.
2. In your existing Supabase project, run `schema_upgrade_v51_15.sql` using SQL Editor. The private `daily_answer_images` storage bucket is created there. Do **not** make it public.
3. In the EdgeOne environment, retain existing `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `GROQ_API_KEY`. Set `GROQ_VISION_MODEL` to an available Groq vision-capable model that accepts image URL data URI messages. Do not put API keys in the browser or HTML. The optional `GROQ_REVIEW_MODEL` may be configured; otherwise the existing Groq model setting is used.
4. Deploy *all* site files and `edge-functions/api/index.js` together. Do not deploy only the frontend; the new endpoints and database columns are required for Snap & Send and AI review.
5. Test in a real staging environment with Supabase and Groq credentials before switching production traffic. The local QA run is static and cannot certify external API services, site permissions, photo grading accuracy, time-zone behavior across actual clients or migration application.

## Recommended manual acceptance tests

- Open existing published multi-subject CBT, then edit/save/reopen it; verify no UUID error and original URL still works. Repeat with edited CBT in a library.
- Save candidate name; reopen a different CBT and confirm the name appears, and edit-name path works.
- Run a regular CBT, answer each question and check 550 ms auto-next, final-question stays available for review, manual Back cancels pending auto-next. Ensure Study Mode still shows explanations. Repeat in Question Pool Practice to confirm that the final question never auto-submits.
- View an admin leaderboard with submitted attempts; confirm score, elapsed time, score/time ordering on desktop and mobile.
- Search admin CBTs, admin Library CBT picker and student CBT Library; test nonmatches and clearing search.
- Admin and student: open CBT scheduled a few seconds into future and watch the counter while tab is active and after switching away/back; confirm open status changes without manual refresh.
- Daily Challenge: test typed response, photo upload and mobile camera, legible vs partly illegible handwritten submissions, photo review, release-time embargo, manual retry of AI provider failure, and private photo access control (non-admin must receive 403).
- After a CBT with wrong answers on different topics, verify topic-specific AI review; check unaffected student/privacy paths, disabled-review settings and a high-score all-correct attempt.
- Generate Physics, Chemistry and Mathematics questions with fractions/indices and inspect rendered equations, options and explanation accuracy before publication.

## Operational and safety notes

- Browser camera support depends on HTTPS and device permission. Desktop browsers may only offer file selection.
- Vision and grading accuracy are probabilistic. Illegible writing must not be guessed; a low-confidence, unclear answer can receive zero credit for its unreadable portions.
- If Groq or the database are unavailable, photo processing and AI review can fail/retry; these features cannot work offline.
- Storing students' images requires clear school privacy/retention practices. Original photographs are not exposed in public result endpoints.
- The schema and external service configuration are not automatically applied by unzipping this archive.
