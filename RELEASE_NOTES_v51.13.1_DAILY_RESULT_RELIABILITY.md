# Gifted Brainz Assessment Hub — v51.13.1

## Fix: result links stuck on “Checking your challenge result…”

### Root cause in v51.13.0 source
The student `GET /api?action=challenge-result` endpoint waited for the entire Groq AI grading request *before* responding with the already released report. Groq could take up to 23.5 seconds plus Supabase reads/writes/retries. EdgeOne and network timeouts could therefore prevent the initial result page from appearing. The browser `api()` had no request timeout, leaving its loading state visible indefinitely when a request stalled. The page polled while unreleased but did not poll an already released result whose score was still pending.

### v51.13.1 solution
- The result GET retrieves only stored release status and report content; it never waits on the AI provider. If release time has passed, the student can immediately see the challenge question, their submitted answer, and the official answer, with an honest "Assessment pending" status until grading completes.
- The result page triggers a **separate authenticated-by-private-result-token** POST (`challenge-grade-result`) to grade the released submission. Once finished, the displayed score, percentage and feedback refresh automatically. The existing administrator grading/override workflows are unchanged.
- To reduce redundant AI calls, the server uses an atomic, 65-second cooldown/lease on the existing `graded_at` field for still-pending records, avoiding duplicate grading when the result is opened in multiple tabs. No database migration is needed; the new route checks a SHA-256 hash of the original private result token and enforces the release time.
- Pending grades now continue polling while the link remains open. If the AI provider is unavailable, students still see the released report and may request a retry; they are not given fabricated marks.
- Result GET requests have an 11-second timeout per attempt (up to two attempts). A failed result fetch presents a clear retry screen; previously loaded report content remains visible during later transient errors.
- Added responsive blue/white/gold loading, pending-grading and error states in `daily-result-reliability-v51.13.1.css`.
- Updated web asset cache versions and the health API build identifier to v51.13.1.

### Deployment
1. Back up the deployed v51.13.0 ZIP and Supabase database.
2. Deploy **all** files in this v51.13.1 ZIP, including `index.html`, `app.js`, `daily-challenge-v51.11.js`, `daily-result-reliability-v51.13.1.css`, and `edge-functions/api/index.js`. Updating only the frontend or only the server will not fully solve this issue.
3. No new SQL migration is required if the existing v51.11 Daily Challenge tables are installed. Retain the Supabase and Groq server-side environment variables.
4. Reload the published site and open an existing **private** result link. Before the release time the official answer should remain hidden. After release, report content should appear promptly; if grading is pending it should show "Assessment pending" before the score eventually arrives.
5. Verify `/api?action=health` includes build `v51.13.1-result-reliability-20261124`, and check the result in a private browser window. Do not share private result tokens publicly.

### QA performed offline
- JavaScript syntax: PASS; original v51.13 Study Mode, Question Pool, LaTeX and PDF regression tests: PASS.
- Browser simulation on mobile: released report visible with pending grade; score and percentage appear after subsequent result read; failed API renders retry action — PASS.
- Mock EdgeOne/Supabase/Groq handler: the result GET returns without invoking Groq, an authenticated POST grades once, a second GET returns the score, repeat POST is idempotent; unreleased result remains embargoed — PASS.

### Still requires production verification
Actual Supabase, Groq, EdgeOne deployment, long-running grading timeouts, and cache behavior were not accessible in this offline environment. If the production database or AI provider is down, the UI now reports that condition instead of staying indefinitely on the loading message; it cannot create a score while those services remain unavailable.
