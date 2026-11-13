# v50.6.3 — Admin blank-content regression QA

## Reproduced root cause

Actual Chromium rendering of v50.6.2 showed a 4-pixel administrator main panel, even though the page body contained the Dashboard markup. `.app-shell` was computed as CSS grid while the fixed sidebar was no longer a grid item. The resulting implicit grid track caused the panel to collapse.

## Correction

An explicit block-layout override in `premium-interface.css` restores normal-flow content (`.main`) without scrolling the viewport-fixed sidebar. This applies on desktop and mobile, and the asset version token was incremented to stop CSS cache reuse.

## Browser results

- Viewports: 1366, 1024, 760, 390, 320 pixels.
- Routes/views at each viewport: Dashboard, Analytics, CBT Tests, Question Bank, AI Question Studio, Brainz Biltz, Results, Student Feedback, CBT Libraries, Question Pools, Settings.
- Passes: **55/55**, failures: **0**.
- Checked visible main pane width, content and topbar existence, document overflow, fixed desktop sidebar and opening/closing mobile menu.
- JavaScript syntax check: passed.
- Existing platform regression tests: passed after updating build-version expectations.
- New layout guard regression test: passed.

## Limitations

The smoke test used the actual Chromium rendering engine and the application source loaded locally, with mock administrator authentication and empty local data. No live EdgeOne or Supabase environment was accessed, so a live deployment check is still advised.
