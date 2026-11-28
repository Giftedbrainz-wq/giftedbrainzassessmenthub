# Gifted Brainz Assessment Hub — v51.13.0

## New: universal mathematical and AI content rendering

- Added `rich-content-v51.13.js` and `rich-content-v51.13.css` to render mathematical notation and formatted AI explanations throughout question pools, CBT Study Mode, Ask AI and Daily Challenges. KaTeX is preferred when available, with existing safe mathematical formatting as a fallback.
- Supports inline `\\(...\\)` and `$...$`, display `\\[...\\]` and `$$...$$`, mathematical environments such as `align`, `equation`, `matrix` and `cases`, plus common standalone LaTeX commands already recognised by the core renderer. Properly styled actual HTML tables replace raw Markdown `|...|` table rows; headings, lists, bold emphasis and code are also formatted.
- The renderer treats source text as untrusted: raw HTML is escaped, links are displayed as plain text instead of injected clickable markup, KaTeX runs with `trust:false`, and code blocks remain literal. Admin-entered text keeps line/paragraph structure; rich Markdown content is rendered when recognised.
- Daily Challenge authoring previews, student question/answer screens, answer release pages, administrator review, assessment feedback and direct downloadable PDFs use the updated content presentation. A student can open a live typeset answer preview while typing without changing their submitted plain-text answer.
- Retains established blue/white styling and carefully placed gold accents; scrollable tables and responsive layout apply to phone and desktop displays.

## New: local-first saving and fewer unnecessary database writes

- Added `browser-drafts-v51.13.js` for device-local draft persistence via IndexedDB, with localStorage fallback, across Daily Challenge written responses, current CBT sessions and Question Pool practice attempts. Local drafts are cached only in the student's own browser and are **never uploaded by the draft utility**.
- A draft can generally be restored after refreshing or reopening the same browser on the same device. Question Pool practice includes a resume action when an eligible unfinished attempt is available. Temporary local draft caches older than 45 days may be cleaned up **on that device only**.
- Question Pool Study Mode cursor/progress syncing is debounced rather than issuing an immediate database update with each navigation. Unsubmitted practice selections are kept locally and sent on final graded submission, rather than as a network write for each selection.
- Daily Challenge submission uses a client-generated result token to support safe retries after a lost network response. Only one final row is stored per challenge/device; duplicate attempts continue to be blocked. No existing final submissions or scores are deleted.
- **Important:** final Daily Challenge written answers remain persisted on the server/Supabase for AI grading, administrator review and secure result recovery. Final CBT and question-pool results remain server-backed as well. This update reduces *unnecessary* writes/storage; it does not and should not eliminate reliable storage of submitted assessment evidence.

## Deployment

1. Back up the current deployed website and the Supabase database.
2. Replace your deployed web files and EdgeOne function with all the contents of the v51.13 ZIP, preserving directory paths; use the same configured project and server-side secrets.
3. No new database migration is necessary if the v51.11 Daily Challenge migration and any previously required migrations have already been applied. Do not re-run old schema scripts without checking your database history.
4. Because the browser caches assets, verify the site loads the `?v=51.13.0` JavaScript and CSS references and refresh/reopen after deployment.
5. Verify production flows: LaTeX and Markdown tables in a public question and Ask AI; student answer preview, local draft recovery, released results, direct PDF download, administrator review, Question Pool practice resume; duplicate submission retry and a normal final submission.

## Constraints and safety

- Same-device browser drafts are not a cloud backup. Private browsing, browser-data deletion, switching devices, or a full browser storage quota can lose unfinished work. Students must still submit before the challenge deadline.
- Math rendering uses existing KaTeX CDN resources; direct PDF export uses the previously configured on-demand `html2pdf.js` CDN. Restricted networks or blockers may require the existing fallback rendering/print route. Live CDN, EdgeOne, Groq and Supabase production integrations were not available to the offline tests included with this release.
- The existing one-submission-per-browser policy remains a convenience constraint, not identity-based cheating prevention. Release embargo and grading checks remain server-side. Server persistence of final written answers is deliberate and required for admin review.
