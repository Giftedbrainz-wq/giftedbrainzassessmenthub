# Gifted Brainz Assessment Hub v50.2.1 — Standalone Brainz Biltz

This update corrects the feature name: **Brainz Biltz**, not Brain Boost. The admin sidebar and student quiz screens use the correct name. There is no separate Brain Boost mode.

## What administrators can do

1. Sign in to Assessment Hub and open **⚡ Brainz Biltz** in the sidebar.
2. Create a new quiz in Draft status. Enter a title, description and seconds per question.
3. Add questions directly with four options, the correct answer, and explanation.
4. Publish the quiz and use **Copy Link**. New links look like `https://your-domain/?biltzQuiz=quiz-slug`.
5. Review results under the quiz's **Results** button. Quizzes are independent from regular CBTs and do not send students into CBT mode.

## Database migration

**Important:** Back up Supabase first. For systems without the v50.2.0 standalone migration, run `schema_brainz_biltz_standalone_migration.sql` in the Supabase SQL Editor. If you already applied the v50.2.0 standalone migration, **do not needlessly re-run the migration**; the existing tables remain compatible. Internally, table and API names continue to use their original `brain_boost_*`/`boost-*` identifiers so deployed data is not disrupted. These names are implementation details, not separate student-facing products.

The previous legacy **CBT-linked Brainz Biltz** challenge links (`?biltz=...`) keep working for existing users. Their management screens are accessible from **Manage legacy CBT-linked challenges**. Older standalone links (`?boost=...`) also continue to open the new standalone Brainz Biltz mode, but all newly copied links use `?biltzQuiz=...`.

## Quality checks

Run `npm run check` and `npm test`. The project includes `qa_browser_smoke.py` for a mock-data student and admin browser check. Real database and deployment verification is still required before publishing widely.
