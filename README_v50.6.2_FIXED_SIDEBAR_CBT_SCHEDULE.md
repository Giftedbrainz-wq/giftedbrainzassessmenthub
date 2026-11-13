# Gifted Brainz Assessment Hub v50.6.2

Base: v50.6.1 App Settings Hotfix (all previous 17 improvements retained).

## Changes in this release

1. **Fixed administrator sidebar.** The navigation is fixed to the viewport on desktop; scrolling a long page no longer pushes the sidebar away. The sidebar has its own single vertical scroll when its menu is too tall. On screens up to 800 px wide, it remains an off-canvas toggleable menu.
2. **Improved CBT Library cards.** CBT titles now use responsive, well-spaced chips; long titles wrap instead of colliding. Cards with more than eight CBTs initially show eight and offer a **View all CBTs** expander. Management, link and delete controls remain accessible.
3. **Scheduled opening and closing for ordinary CBT tests.** In **CBT Tests → Edit Quiz / Create CBT → Assessment availability**, administrators can optionally choose **Opens at** and/or **Closes at**. A blank schedule means no time restriction. The form uses the administrator browser's local timezone, and converts the dates to UTC ISO before saving.
4. **CBT link live countdown.** When students open a link before the scheduled opening time, they see the title, summary, exact opening date and a countdown (days and HH:MM:SS). The Start Assessment control is disabled until the time arrives. The page automatically reloads the public CBT metadata when the opening time is reached. After closing, new attempts are disabled.
5. **Server-enforced CBT schedule.** Supabase-backed server routes validate the schedule when a CBT is created or updated, enforce it for `attempt-start`, and do not expose unopened CBT questions or their image media. This cannot be bypassed by merely changing the browser clock; use the server's current time.
6. **Standalone Brainz Biltz live countdown.** Students see a seconds-updating countdown before the opening date, including after pre-registration. The page automatically refreshes when it opens, and returning registered students are offered Start Assessment. Legacy CBT-linked Brainz Biltz countdown is retained.
7. **Existing flows preserved.** Previous v50.6.1 app_settings health-check fix, comprehension passages, Question Pools, EduSpace, results, challenge registrations, AI and document extraction continue in the package.

## Deployment

Deploy the **entire package** to EdgeOne Pages using the same project and environment configuration as v50.6.1. Ensure the API worker `edge-functions/api/index.js` is deployed along with the frontend; updating only the HTML/CSS/JS does **not** enforce the schedule server-side.

**No new SQL migration is needed for the v50.6.2 features**: standard CBT schedules are stored in the existing `quizzes.settings` JSONB field. If you have not yet applied the earlier `schema_v50_6_0_migration.sql` required for the v50.6.0 standalone Brainz Biltz registration features, that separate migration still applies.

### Administrator verification after deployment

- Open a CBT in the Edit Quiz form; set an opening time a few minutes in the future and a closing time after it. Save and confirm that the schedule appears in the CBT list.
- Open its student link before opening: a live countdown must show, and Start Assessment must not be clickable.
- At opening time, refresh/auto-update: Start Assessment becomes available. After closing time, new attempts should be denied; an already started attempt can finish its original permitted duration.
- Open a scheduled standalone Brainz Biltz link before opening: pre-registration remains available and a countdown visibly updates every second.
- In the admin panel scroll a long Question Bank or Library page: the navigation remains fixed on the left; check at desktop width and narrow mobile width.
- In CBT Libraries, verify the first eight CBT chips and the View all expander for long libraries.

## Local checks

- `npm run check` — passed.
- `npm test` — passed, including `tests/cbt-schedule-navigation-regression.mjs`.
- Browser screenshot validation was **not** completed because the container browser blocked access to both the local HTTP test page and file URL. Review the rendering on desktop/mobile after deployment.
- No connection to the production Supabase environment or live EdgeOne deployment was made.

## Scope note

The **closing time is the last moment for a new CBT attempt to start**. A student already taking a CBT keeps the quiz's configured per-attempt duration unless the existing test settings impose a more restrictive rule. Brainz Biltz standalone retains its own end-time attempt rules.
