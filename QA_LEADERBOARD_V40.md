# Gifted Brainz Assessment Hub v40 — Leaderboard QA

Changes in this release:
- Student/public/admin "View leaderboard" modal continues to load all participants (API request uses a high limit; rendering uses the full returned set).
- Admin Results page quick preview remains top 10.
- Leaderboard modal widened to 1320px/98vw on desktop.
- Leaderboard table text enlarged slightly while retaining readability.
- Leaderboard table now has a dedicated vertical scroll area with a visible scrollbar and a scroll hint.
- Export leaderboard image was redesigned as a branded portrait-style poster with a polished header, top-three podium cards, remaining ranked rows, and a branded footer.
- Export count selector is still respected; exported badge/filename uses the number actually exported.
- Cache-busting version updated to v40-leaderboard-20261002.

Validation performed:
- node --check app.js: PASS
- python -m py_compile test_server.py: PASS
- source reference check in index.html: PASS
- ZIP integrity: PASS after packaging
