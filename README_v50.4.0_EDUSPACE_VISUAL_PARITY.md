# Assessment Hub v50.4.0 — Installation and Visual Matching

This release aligns the **entire Assessment Hub interface** with the existing Gifted Brainz EduSpace visual language. The source is the prior v50.3.1 Assessment Hub application; none of its assessment records are deleted.

## Install

1. Download the full `Gifted_Brainz_Assessment_Hub_v50_4_0_EduSpace_Matched_UI.zip` archive. Extract it to a folder on your computer.
2. Confirm the extracted root folder contains **`index.html`, `app.js`, `styles.css`, `eduspace-ui.css`, `assets/` and `edge-functions/`**. If `eduspace-ui.css` or `assets/` is missing, do not publish that copy.
3. Back up your existing EdgeOne deployment and environment variables. Deploy **all files**, not just `index.html`, to the existing Assessment Hub project.
4. Preserve existing EdgeOne environment variables, Supabase credentials and database tables. **No SQL migration** is needed for this design update.
5. Open the staging deployment and refresh bypassing cache (`Ctrl+Shift+R`). Confirm images load in DevTools Network as `image/png` rather than HTML; `assets/icon.png` and `assets/subject-cover/chemistry.png` should be available.
6. Test the admin console, question bank, extraction review, live CBT, results, CBT libraries, private access notice, standalone Brainz Biltz and public Brainz Biltz pages on mobile and desktop.

## File arrangement

`index.html` loads `styles.css` and then `eduspace-ui.css` to override old Hub-only styles. `app.js` retains all old operations, while using EduSpace's logos and subject art. `assets/` contains **real PNG files** and should be served directly; do not convert this directory to a text or HTML resource. `EDUSPACE_ASSET_HASHES.json` records exact copied asset hashes used for verification.

The `tests/` folder includes existing regression tests and a new visual consistency check. Run `npm run check && npm test` in a Node 20+ environment. `qa_all_views_unified.py` is a *local Chromium fixture* and does not test the deployed server. Sample PNG screenshots can be found in the separate preview links supplied with this release.

## If graphics appear as raw HTML

If the browser requests `assets/icon.png` but the hosting service responds with `text/html` (often the site fallback page), fix static asset routing or deploy the missing asset directory. Avoid replacing images with inline HTML or leaving the assets outside the deployed root. Clear edge/server caches and the browser cache after publishing.
