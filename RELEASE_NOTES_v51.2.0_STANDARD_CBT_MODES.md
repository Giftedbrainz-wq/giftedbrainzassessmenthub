# Gifted Brainz Assessment Hub v51.2.0 — ordinary CBT modes and loading logo

Based on v51.1.0.

- The ordinary CBT creator has an Assessment Mode selector (Study or Practice). The mode is stored in the existing quiz.settings JSON (no SQL migration). Existing quizzes default to Practice.
- Practice Mode remains timed, without feedback until submission.
- Study Mode has no visible timer or tab-switch penalty and displays authenticated correct-answer/explanation feedback after a student's selection; colours are soft and light. It retains normal score submission when the student finishes.
- Study sessions use an expiring seven-day attempt token for resumability (a security validity limit, not an examination countdown).
- Brainz Biltz competitions cannot use the ordinary Study Mode feedback endpoint.
- The loading logo uses absolute same-origin icon paths with a backup local asset.

## Staging validation
Create a new Study CBT and an existing Practice CBT. Test shuffled options, immediate answer, submission, refresh/resume, private CBT restrictions, Brainz Biltz challenge restrictions, and mobile logo loading. Live Supabase interaction has not been tested in this build.
No new environment variables or SQL migrations are required.
