# Gifted Brainz Assessment Hub v50.6.3 — Critical layout repair

## Symptom

The administrator sidebar appeared, but the main content area was blank on every administrator page after deploying v50.6.2.

## Root cause

The pre-existing theme CSS declared `.app-shell { display: grid }`, while v50.6.2 fixed the sidebar and assigned `.main` a left margin and percentage width without removing that grid layout. Chromium then placed `.main` in an implicit grid column only 4 px wide. The content and topbar existed but were squeezed into that nearly invisible column. This was a CSS layout regression, not an API or Supabase database failure.

## Fix

- Set the admin shell to normal block layout on all device sizes, instead of grid.
- Reserve 260px on desktop for the fixed sidebar and give main content the remaining viewport width.
- Maintain a slide-in navigation menu on phones; the main content remains full width.
- Preserve earlier v50.6.2 features: CBT scheduling, library layouts and Brainz Biltz countdowns.
- Update asset query version to v50.6.3 to prevent browsers from reusing old stylesheets.

## Deployment

1. Deploy the full ZIP replacing v50.6.2 application files (or replace `premium-interface.css` and `index.html` together).
2. No new database migration is required for this CSS fix.
3. Hard-refresh the Assessment Hub page to clear cached stylesheets.
4. Confirm Dashboard, CBT Tests, Question Bank, CBT Libraries, Brainz Biltz, Results, Analytics and Settings are visible and the sidebar stays fixed during page scrolling.

## Testing scope

See the generated QA report for local layout tests. A browser-based local rendering test does not replace testing against your live EdgeOne deployment and Supabase data.
