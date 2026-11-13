# Gifted Brainz Assessment Hub — v50.7.0 EduSpace linking

## Implemented

- Added an interactive **Connect your EduSpace** section beneath each CBT student introduction, including one-time-code entry and server confirmation.
- Added a user-facing crown emblem to the EduSpace linking panel while keeping the Hub's existing branded corporate icon files intact.
- Added authenticated server-to-server HMAC-SHA256 signed `account.linked` and `account.unlinked` events. Codes are verified on EduSpace and never saved in plaintext by Hub. Events use a five-minute timestamp window; the shared secret is only in server environment variables.
- Stored current v2 link state in a **new Supabase table** (`eduspace_device_links`), keyed by the existing stable browser device ID. Older links have no implicit authority and cannot become automatically linked again.
- Added an **Unlink this browser** option which revokes the EduSpace side first, then the Hub record; neither action erases existing student learning results.
- Replaced the CBT completion exit action with **Return to EduSpace**, using an HTTPS server-configured URL. The link is also available to users who have not yet linked; they can log in and get a code.
- On new and retried quiz submissions, the server attempts to synchronise completed CBT reviews with EduSpace for linked students, only if results/corrections are permitted. Incorrect and unanswered questions can populate EduSpace's mistake notebook; failed synchronisation does **not** make a completed CBT submission fail. Retry a submitted attempt to retry the idempotent sync event.
- Bumped HTML/CSS/JS query versions to avoid stale cached client scripts.
- Added an integration test that checks HMAC signatures, valid/invalid codes, storage, linked status, unlink and missing-secret rejection.

## Deployment requirements / limitations

1. Run `schema_eduspace_device_link_v2.sql` on the **real Assessment Hub Supabase database**. No migration has been run from these files.
2. Configure `ASSESSMENT_HUB_SYNC_SECRET` on **both servers**, identical and at least 32 characters. Set the Hub server's `EDUSPACE_BASE_URL` to the real HTTPS EduSpace domain (or use its authenticated Platform Settings URL).
3. Deploy the EduSpace v12.7.0 ZIP FIRST, followed by this Hub release. Both changes are necessary for live linking.
4. Because the existing Hub identifies student quiz takers by a persistent **browser/device ID**, this integration links an EduSpace student to **that browser/device**, not to a separate authenticated Assessment Hub student account. Clearing browser storage or switching devices requires a new code.
5. Successful local tests use mocked Supabase and EduSpace HTTP responses. Actual HTTPS, EdgeOne secrets, Supabase SQL and student records must be verified after deployment. A failed sync may need a retry; there is no background delivery queue.
6. Do not delete student records or historical attempts to reset the links. The v2 protocol deliberately requires a new code, so previous pairings are inactive.

No live deployment, data deletion or account unlinks have been performed in the current session.
