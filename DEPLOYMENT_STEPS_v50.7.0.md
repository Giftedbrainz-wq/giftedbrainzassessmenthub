# Assessment Hub v50.7.0 — safe launch order

1. Back up the Hub Supabase database and the original EdgeOne deployment.
2. Apply `schema_eduspace_device_link_v2.sql` on the Hub Supabase project's SQL editor. It creates a **new** link table and enables RLS with no anonymous access; it does not truncate or delete old records.
3. Deploy the companion EduSpace v12.7.0 backend FIRST, and set its server secret `ASSESSMENT_HUB_SYNC_SECRET` (32+ characters).
4. On the Hub's EdgeOne server set `ASSESSMENT_HUB_SYNC_SECRET` to the same value and `EDUSPACE_BASE_URL` to the actual EduSpace HTTPS domain, with no trailing path. Hub admin Platform Settings can store the URL as an alternative, but the environment value takes priority.
5. Deploy this updated Hub code; run `npm run check && npm test` in its project root.
6. Open an ordinary public CBT test. Confirm the student introduction has an EduSpace code input. Enter a fresh code generated from an EduSpace student's My Learning Centre and check for **EduSpace linked successfully**. A used, expired or invalid code must fail.
7. Submit a test that allows reviews and verify **Return to EduSpace** works. After returning, verify completed CBT history and missed/unanswered questions appear in the intended EduSpace account; a quiz with reviews disabled must not expose or sync unreleased corrections.
8. Test **Unlink this browser** and use another valid student's code to re-link. Test mobile responsiveness. Existing Hub submissions and student data must remain intact.
9. Review EdgeOne/Supabase logs for any failed signing, schema or connectivity issues. Server-side integration remains disabled until the required variables and SQL migration are present.
