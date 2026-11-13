# Gifted Brainz Assessment Hub v41 — Leaderboard QA

- Leaderboard modal renders all loaded participants, not only the top 10.
- Dedicated fixed-height scroll viewport added; first 10 rows fit in the desktop viewport with larger readable text.
- Explicit “Scroll for more” control added.
- Admin Results page remains top-10 preview only.
- Admin View Leaderboard opens the full participant list.
- Public/student leaderboard views continue to use the full first-attempt leaderboard.
- Removed device_id filter from leaderboard queries so all submitted first attempts are eligible for display.
- Export image rebuilt with branded header, top-performer cards, ranked table, larger typography, and branded footer.
- Export filenames and toast use the actual exported row count.
- Cache-busting version updated to v41.


## v42 export and rank-neutrality update — 2026-10-02
- Replaced the previous leaderboard PNG podium/poster composition with a completely different landscape institutional-results bulletin format.
- Export uses a clean header, summary metrics and table; there is no podium, medal treatment or special first-place colour.
- Removed the brown/gold first-row highlight from on-screen official leaderboards; ranks are presented as neutral numeric values.
- Frontend cache-busting advanced to v42.
