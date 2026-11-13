# v50.2.1 — Brainz Biltz name correction

- Corrected the standalone quiz feature name from Brain Boost to **Brainz Biltz** throughout student and admin pages.
- Updated new shareable links to `?biltzQuiz=<slug>`.
- Preserved previous standalone `?boost=<slug>` and legacy CBT-linked `?biltz=<slug>` URLs.
- Kept original standalone quiz tables/API identifiers for compatibility with anyone who ran v50.2.0 migrations.
- Renamed the standalone SQL migration file and regression test.
- Left ordinary CBT, legacy Biltz challenges and 1,000-question extraction logic unchanged.
