# Gifted Brainz Assessment Hub v50.4.2

## Changes
Assessment Hub now prioritises the **Baskerville Old Face** font and recentres the student loading, introduction, candidate identity, assessment summaries and results. Question/answer text stays left-aligned.

## Font availability
Baskerville Old Face is a licensed Microsoft/Office typeface, **not bundled with the package**. When installed, browsers use it directly. Other devices request the similar Baskervville font through Google Fonts and fall back to local Georgia if fonts.googleapis.com is inaccessible. No font binaries are distributed.

## Deployment
Deploy the contents of this ZIP to **the Assessment Hub EdgeOne site only**; leave EduSpace untouched. The versioned CSS URLs are bumped to avoid stale cache. No new SQL is needed. After deployment, check a candidate's name and timer on phones and desktops, and a loading card and result screen.
