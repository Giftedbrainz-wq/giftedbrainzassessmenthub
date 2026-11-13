# Gifted Brainz Assessment Hub v51.1.0 — targeted corrections

Base: v51.0.0 CBT Workspace GitHub ZIP.

- Public CBT Library cards now present compact Start Assessment 🎯, Results & Review 📊 and optional Share actions. Library examination links preserve `library=<slug>` to support the Return to CBT Library action on the result screen. The result-review shortcut opens only results already saved in the same browser; a missing result is explained rather than inventing one. Existing private-library gates remain enforced server-side.
- Completed test navigation adds Return to CBT Library when relevant. Return to EduSpace, corrections and leaderboard remain. Removes Save Result Link from the student completion actions; administrator result-link controls remain unchanged.
- Public library response now includes each quiz's existing availability settings, and the library displays opening/closing status with start disabled before opening or after closing. Standard CBT server-side time guards are preserved.
- CBT availability editor explicitly uses West Africa Time (Africa/Lagos, UTC+1) for both start and end date+time rather than the administrator device's timezone. Existing server controls remain authoritative; no schema change.
- Browser identity fallback uses sessionStorage and a same-site Secure cookie when localStorage cannot store the ID, to reduce unnecessary Brainz Biltz 'enable browser storage' errors. This does NOT bypass private-quiz activation, challenge registration or the competition's eligibility controls.
- Existing EduSpace signed submission events continue to use distinct browser IDs, which allows the EduSpace v12.19 server to associate up to two browsers with one account. For two-device synchronisation, both applications must be deployed together and must share their existing server-side ASSESSMENT_HUB_SYNC_SECRET. Do not expose secrets to GitHub.

**Limitations:** offline/browser-identification issues can still arise if all storage and cookies are blocked. Results & Review from a different browser requires the server-authorised result flow and does not bypass result-access rules. Both-device result delivery depends on live credentials, the EduSpace endpoint, and successful signed requests. No real student account or live Supabase load test was performed.
