# Assessment Hub v51.0.0 — Changelog

- Added opt-in EduSpace link-code form to student CBT introduction and result screens.
- Added secure browser proof-of-connection credentials, HMAC-signed account link events, and sensitive-data-free event receipts.
- Added explicit completed CBT question-review synchronisation and per-question bookmarking to EduSpace.
- Added Supabase integration connection and durable outbound event-queue tables/migration.
- Added authenticated queue-retry endpoint with bounded concurrent processing.
- Added guards for unfinished assessments, invalid result tokens, wrong device credentials and withheld Brainz Biltz reviews.
- Expanded cross-app tests, preserved existing CBT/private-library and Biltz features.
- Bumped static asset version identifiers to v51 and updated version-specific existing test accordingly.

**Deployment status:** staging candidate only; does not establish a live account integration until the SQL migration and both servers' environment variables are configured.
