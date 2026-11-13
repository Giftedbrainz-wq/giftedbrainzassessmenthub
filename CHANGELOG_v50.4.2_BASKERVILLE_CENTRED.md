# Assessment Hub v50.4.2 — Baskerville Old Face + centred student displays

- Prioritise installed **Baskerville Old Face** across the interface. If not available, use an openly hosted Baskervville (Google Fonts) fallback, then system Baskerville/Georgia/Times. No proprietary font file is distributed.
- Replace old Source Serif 4 and Inter font-family declarations across the Hub (including navigation, questions, results, buttons, admin screens, Brainz Biltz).
- Centre the **Loading CBT** card, emblem, title, copy and progress bar; centre the assessment introduction, title, candidate-detail headings, summary metrics and action buttons.
- Centre **CBT candidate name and header identity**, leaving timer and controls separate; centre question numbering but keep question text and A–D options left-aligned for accessibility.
- Centre result summaries, and centre Brainz Biltz welcome/results presentation.
- Maintain EduSpace-style navy/gold/white branding; **no EduSpace-only avatars, team crests or subject-cover images were added**.
- Includes mobile stacking and long student-name overflow handling at 320 px.
- Existing quiz data, APIs, SQL schemas and behavior untouched. No new database migration.
- Exact Baskerville Old Face display depends on installation on the student's device; an equivalent style is shown through the fallback otherwise.
