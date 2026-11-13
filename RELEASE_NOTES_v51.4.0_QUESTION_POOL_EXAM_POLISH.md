# Gifted Brainz Assessment Hub — v51.4.0

This complete GitHub-ready source ZIP builds on **Assessment Hub v51.3.0**. It does not alter the separate EduSpace repository or automatically deploy any live website.

## Improvements

1. **Option selection:** A calm navy/white answer-choice style replaces the heavy selected-option blue fill, especially the letter badge. Selected choices remain obvious through a restrained border, gold accent and checked radio.
2. **Passage titles:** Local document import recognises headings such as `Passage C: The Pearl`, `Passage Title: The Pearl`, `Passage II` with `Title: The Pearl`, and suitably identified standalone titles. An author's custom title is retained rather than overwritten by a generic passage number. The AI extraction instruction now explicitly preserves custom titles. The extracted-question review screen allows the administrator to correct passage titles before saving.
3. **Paragraphs:** Original line breaks are stored and displayed as individual paragraphs for reading passages in both CBT and Question Pool modes. The extraction review has a multiline passage editor, with edits propagated across identical passage records in the draft. Manual passage editors retain entered line breaks.
4. **Roman numerals:** Sequential Roman enumerators (I, II, III, IV and onwards) inside question stems are shown as individually aligned list rows rather than continuous prose; ordinary standalone prose is not altered. Formatting is applied to CBT, Study, Practice, review and question-bank displays.
5. **Pool spacing:** Reduced oversized gaps around student pool headers, title/description, topic selection, and administrator pool-card headings across mobile and desktop.
6. **Study and Practice controls:** Added the same shared calculator tool to both Question Pool modes. The existing desktop question navigator and mobile navigator toggle are preserved.
7. **Navigation arrangement:** On CBT, Study and Practice, Previous and Mark for Review share the first row in equal widths; Next (or Submit/Finish) occupies the full second row.
8. **Calculator:** Removed the instruction-like explanatory sentence about decimal entry from the calculator popup. Decimal handling remains functional (for example, `0.8`).

The v51.3.0 changes to result links, Question Pool passage hydration, saved candidate names, CBT Library, Brainz Biltz device identification, and navy/gold branding are retained.

## Technical changes

- `app.js` — passage parsing, paragraph rendering, Roman-numeral formatting, shared calculator, extraction review editing and Question Pool toolbars.
- `edge-functions/api/index.js` — extraction instructions preserve source titles, paragraph newlines and Roman statement boundaries. No change to scoring, authentication or response privacy.
- `refinements-v51.4.css` — responsive UI overrides loaded after existing brand and exam styles.
- `index.html` — stylesheet registration and cache-busted script URL.
- `tests/v51.4-examination-polish.mjs` — adds new functional regression checks. Older tests adjusted only to include the new parser dependency and JS version string.

## Verification

- `npm run check` — passed JavaScript syntax checks and Python compilation.
- `npm test` — passed every included automated test, including custom source title retention, passage breaks and Roman-numeral rendering.
- No real Supabase records were changed. No production EdgeOne website was deployed or tested here. Responsive CSS rules were checked statically; a final visual check on the deployed site is still needed.

## Deployment precautions

1. Back up the live Assessment Hub database, EdgeOne project and environment variables.
2. Replace the existing **Assessment Hub** project files with the ZIP contents. Do not upload these files into EduSpace.
3. Keep server-side Supabase credentials and existing database migrations unchanged; **this update requires no new SQL migration**.
4. After deployment, use a dummy CBT and Question Pool to test the eight changes on a mobile phone and a laptop before opening them to students.
5. The title/paragraph improvements protect **existing stored content** as retrieved. They cannot automatically reconstruct a passage that was never stored or whose original source was lost. Inspect source titles in the extraction review before saving.
