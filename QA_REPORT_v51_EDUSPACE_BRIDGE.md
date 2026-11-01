# Gifted Brainz Assessment Hub v51 — Quality Assurance

## Automated checks (local)

- `npm run check`: passed (app.js, EdgeOne API, sibling integration module, Python syntax).
- Existing private CBT/library regression suite: **22/22 passed**.
- Existing Brainz Biltz regression suite: **15/15 passed** (the cache-key check now verifies the new v51 version rather than demanding the old v50 cache key).
- New EduSpace bridge integration suite: **8/8 passed**, covering disabled configuration, link code, credential matching, private result ownership, review gating, HMAC signatures, one-attempt idempotency, bookmark authorisation, retry queue and cron bearer security.
- EduSpace v12.4.0 Learning Centre test suite: **7/7 passed**, unchanged from its previously delivered package.
- Additional local **cross-application test with the real EduSpace v12.4.0 event handler:** passed (link code → HMAC account linking → completed CBT event → Mistake Notebook → bookmarked question → Saved Questions).

## Not yet verified

- EdgeOne production import/bundling behaviour, real Supabase SQL migration and RLS, deployed end-to-end connections or external cron scheduling.
- Real browser/device workflows, shared-device account switching, error recovery if an account code was consumed but the link was not retained.
- Tests with actual large sets of mixed passage/diagram questions and 600 concurrent users.

## Known limits

- Assessment Hub v50 is browser/device-based; integration is a linked-browser credential, not full Hub student authentication.
- Explicit student action is required to synchronise results; do not assume automatic background import.
- Unanswered questions and unreviewable tests are not sent to EduSpace.
- Secure unlink/relink and shared-device account recovery require an update to both platforms.

**Conclusion:** New and existing local tests pass; release is a staging candidate, not a production capacity certification.
