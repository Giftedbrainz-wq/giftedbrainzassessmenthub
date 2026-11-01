# Gifted Brainz Assessment Hub v51 — EduSpace Learning Centre Integration

This package updates Assessment Hub **v50** and interoperates with **Gifted Brainz EduSpace v12.4.0**. The existing quizzes, question extraction, admin tools, private CBT access, results, and Brainz Biltz remain in place.

## What is new

- A student may open an Assessment Hub CBT link, generate a one-time code from **EduSpace → My Learning Centre**, and enter it in **Connect your EduSpace Learning Centre** on the Hub test-introduction screen.
- Link events are signed and sent server-to-server with HMAC SHA-256; the shared key is never sent to the browser.
- The Hub creates a cryptographically random, browser-specific 256-bit credential, stores only its SHA-256 digest in Supabase, and requires the credential for future synchronisation.
- After completing a CBT **with question review enabled**, the student can select **Sync completed CBT to EduSpace** on the result screen. Questions answered incorrectly populate the EduSpace **Mistake Notebook**; reviewed questions contribute to its assessment summary.
- On a personal CBT review, the **Save to EduSpace** button adds a question to **Saved Questions** in EduSpace.
- Question text, options, correct answers, explanations, subject and available CBT-section/topic names are preserved (within EduSpace size limits).
- Failed outbound transfers are saved in a private Supabase outbox and can be retried by a scheduled server-side request. The CBT itself never fails because EduSpace is unavailable.
- Students' existing EduSpace Study Planner, Study Partners, Academic Achievement Badges, and Ask for Explanation continue running on EduSpace; this package supplies reviewed assessment data rather than reimplementing those features in Hub.

## Deployment — must complete before enabling

1. Back up the existing Assessment Hub database and application deployment. In the **same Supabase project used by Assessment Hub**, run **`schema_eduspace_integration_v51.sql`** in SQL Editor. This creates two additional tables and indexes; it does not delete assessment data.
2. Deploy the **entire** v51 package to the Hub's EdgeOne project, including `edge-functions/api/index.js`, its new sibling `eduspace-bridge.js`, `app.js`, `index.html` and `styles.css`. Use a build pipeline that supports standard relative ES module imports.
3. Set **`ASSESSMENT_HUB_SYNC_SECRET`** to a new random server-side secret at least 32 characters long, **identical** to the secret on the EduSpace v12.4.0 server. Never put this value in frontend files or Git.
4. Set **`EDUSPACE_BASE_URL`** to the deployed EduSpace HTTPS origin, such as `https://your-eduspace-domain.example` (no path/query, no trailing `/api`).
5. Set a different random 32+ character server-only **`ASSESSMENT_HUB_CRON_SECRET`** in the Hub function environment. If you want automatic retry after failed webhook delivery, configure an authenticated server-to-server scheduler to **POST** `https://<assessment-hub>/api?action=hub-integration-drain` with `Authorization: Bearer <ASSESSMENT_HUB_CRON_SECRET>`. Do not call this endpoint from student browsers or publish the cron secret. A cadence such as once per minute is suitable for the retry queue (scale it based on production demand).
6. Both sites must use HTTPS, correct server-side API routes, production secrets, and stable Supabase storage. Update EduSpace to v12.4.0 before attempting a link.
7. On staging, complete the manual test described below before deployment to production.

**Security:** Both `eduspace_hub_links` and `eduspace_hub_outbox` have Row Level Security enabled with no access for normal Supabase roles. They are only accessed using the existing server-side service/secret key.

## Student experience

1. Sign into your EduSpace account and open **My Learning Centre → Generate one-time link code**.
2. Follow a CBT link to Assessment Hub, and in the CBT introduction enter that code in the **Connect your EduSpace Learning Centre** panel.
3. Complete the CBT and review its results. Select **Sync completed CBT to EduSpace**; the Hub sends the reviewed answers to your EduSpace account.
4. In the CBT's **View Corrections**, use **Save to EduSpace** on an important question to bookmark it in the EduSpace Saved Questions list.
5. Return to EduSpace to view the Mistake Notebook, Saved Questions and available explanations.

## Important limitations

- **Hub v50 has no separate student-account login.** Its normal CBT identity is based on device/browser information. The new integration is therefore an **opt-in linked browser session**, not a verified cross-site Hub account. A transfer requires the private browser credential and the matching private result token for a completed CBT. Do **not** link a shared/public browser. Future Hub student logins would be needed for seamless per-student automatic synchronisation across multiple browsers/devices.
- Completed CBT synchronisation is **student-confirmed**, not automatic in the background, to avoid attributing a test to a previous user on a shared browser.
- Only assessments with released reviewable answers can be synchronised. For Brainz Biltz challenges, the release policy must also permit viewing answers. Unanswered questions are currently omitted from the EduSpace transfer because EduSpace v12.4.0 accepts only valid answer indices; this can affect its imported performance summary. The Hub's own score remains authoritative.
- The integration supports **at most 250 answered multiple-choice questions and 300 KB per event**. It does not send PDF/image attachments or unreviewed questions, and does not automatically include older tests completed before account linking.
- A Hub browser connection cannot yet be safely unlinked/reassigned from EduSpace v12.4.0. The link is intentionally not exposed as a removable button until both platforms implement account recovery/relinking. Administrators should arrange secure identity verification before manual changes.
- The outbox is durable **when backed by a properly configured Supabase database**, but a cron/scheduler is needed to retry events after the student leaves the page. Webhook failures never interrupt CBT submission.
- **600 concurrent users and live server capacity have not been verified.** Exercise a staging load test with actual EdgeOne/Supabase capacity before a large public launch.

## Test scenarios for staging

- Connect with an unexpired EduSpace code, then verify the Hub browser status.
- Enter an expired/wrong code: linking fails without storing an active browser credential.
- Finish a CBT and select Sync: mistakes and assessed-topic information appear only in the matching EduSpace account.
- Save a reviewed question: it appears in EduSpace Saved Questions with its explanation.
- Verify that an unfinished, unreviewable, private/other-person's CBT does not disclose answers through the integration.
- Take a CBT with no internet connectivity to EduSpace: normal CBT submission succeeds; later authorised outbox processing recovers the event.
- Confirm two different EduSpace students cannot obtain another student's notebook, bookmarks or private answers.

## Build and tests

`npm run check` validates browser and server JavaScript syntax. `npm test` runs the existing private-library and Brainz Biltz regressions plus the Hub bridge tests. An additional cross-platform staging smoke test was run against the *actual* EduSpace v12.4.0 event receiver during development; see `QA_REPORT_v51_EDUSPACE_BRIDGE.md`.

No production credentials are stored in this package.
