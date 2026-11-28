# Gifted Brainz Assessment Hub — v51.15.3

This is the **Assessment Hub**, not EduSpace. This deployment builds on v51.11.0 and preserves existing Question Pools, CBT Libraries, Study Mode, Ask AI, first-attempt leaderboards, private-library approval, engagement counts, and other CBT workflows. **No Paystack integration or ₦3,000/month registration message is included.**




**Important v51.15.3 English import fix:** The former importer missed a repeated passage embedded inside each numbered question in the original English TXT. v51.15.3 now separates embedded passages from question stems, restores exactly two groups (reading Q1–5, cloze Q6–15), and suppresses unintended passages on Q16–60 in the specified supplied mock. It can render already-saved old-format questions without updating the database. See `RELEASE_NOTES_v51.15.3_ENGLISH_PASSAGE_ROOT_CAUSE.md`. Deploy both the frontend and EdgeOne API; no additional SQL required for this patch.

## NEW in v51.15.0 — assessment UX, Snap & Send, and personalised revision

The full change log is in **`RELEASE_NOTES_v51.15.0_IMPLEMENTATION.md`**. Key improvements: candidate-name persistence, an upgraded timed leaderboard, faster CBT/library searches, automatic next-question navigation, subtler question typography, live schedule countdowns, verified UUID error fix, premium Daily Challenge welcome, photograph or typed Daily Challenge submissions with automatic marking of only legible work, topic-specific AI study reviews, and stronger AI-generated math validation.

**IMPORTANT — database migration and model configuration required:** Run **`schema_upgrade_v51_15.sql`** in the existing Supabase project and set a working vision-capable **`GROQ_VISION_MODEL`** in EdgeOne environment variables (along with the existing server-side Groq and Supabase secrets). Deploy both the new static site files and **`edge-functions/api/index.js`**. Do not upload only the website files. Vision marking/AI reviews require live configured external services and should be tested on a staging deployment before public use.

## NEW in v51.14.0 — subject combinations, focused revision, responsive UI

- **One multi-subject mock, candidate-selected subjects:** Create a section for every available subject, enable *Allow students to choose their subject sections*, set the maximum number of subjects, and check *Compulsory* against required sections. Students choose their own combination (no predefined Medical/Engineering paths), with server-side validation. A student's selected section IDs are retained in the attempt's `student_data` JSON and are used to determine which questions are delivered, marked and reviewed. **Every selectable section must contain questions before publication.**
- **Topic-level revision report:** After a CBT result is released, missed questions are grouped by their stored subject section and topic. Students see weaknesses and topic accuracy in their CBT result and result link. **This is a deterministic, explainable analysis of recorded answers, not an external generative-AI call.** Good topic tagging on imported questions improves its accuracy.
- **CBT Library and phone responsiveness:** Desktop library now uses a spacious two-column card grid; phones reflow into one column with compact actions. Assessment, question pool, subject picker, corrections and other components have responsive overrides in `upgrade-v51.14.css`.
- **Question Pool practice review:** Circular score, results summary and a centred corrections view. The Question Pool still has **no leaderboard**; normal CBT leaderboards are unchanged.
- **Private WhatsApp access:** Subtle, continuous back-and-forth luminous sweep; the real WhatsApp link and private-device approval remain unchanged.
- **Daily Challenge welcome:** Cleaner brand presentation and restrained entrance animation. Motion is disabled when the device requests reduced motion.
- **Paid CBT disabled:** Admin offers Public/Private only. Previously paid CBTs remain protected by device approval but no fee is requested; old records are not deleted. No Paystack integration is activated.
- **Compatibility:** All v51.13.2 files/features retained. No new Supabase table or SQL migration is needed for the above additions; existing `quizzes.settings`, `attempts.student_data` and `questions.topic` columns are used. Redeploy **both** the static assets and `edge-functions/api/index.js` together.
- **Testing:** See `QA_v51_14_0.md` for local tests and the mandatory post-deployment checks.

## NEW in v51.13.2 — enforce Daily Challenge tab-switch rules, Delete & PDF

- Daily Challenge tab-switch monitoring: first two switches warn, third triggers automatic submission with a score of zero. The count is saved in the current browser. As with all web-browser integrity checks, this is a deterrent rather than tamper-proof proctoring. The existing CBT tab-switch rules are preserved.
- Admin **Delete** replaces Archive. It permanently removes the challenge and its submissions, marks, feedback and result links after explicit confirmation. **Run `schema_daily_challenge_delete_v51_13_2.sql` once in Supabase before deploying this feature; back up important work before deletion.** Uploaded media files are not automatically purged.
- Removed the student's live-answer/LaTeX preview (student answers are saved exactly as typed); the administrator's preview and released answer rendering remain.
- Downloadable result PDF preserves the same distinct question, student answer, official answer and feedback cards as the screen; formatting, math, tables and paragraph breaks remain. Added more readable export typography and safer page breaks.
- Read `RELEASE_NOTES_v51.13.2_CHALLENGE_SECURITY_PDF.md` and `QA_v51_13_2.md` for details and verification scope.

## FIX in v51.13.1 — Daily Challenge result reliability

The result page no longer waits for an AI grading call before displaying the released challenge and official answer. The score is assessed separately, appears automatically when available, and can be retried if pending. A slow/broken API now shows a retry screen instead of being stuck on “Checking your challenge result…”. Released results with pending scores are polled. Concurrent grading attempts have a per-submission lease to avoid unnecessary Groq calls. **No SQL changes** are needed for this patch if the existing Daily Challenge schema is installed. See `RELEASE_NOTES_v51.13.1_DAILY_RESULT_RELIABILITY.md` and `QA_v51_13_1.md`. Both the site and `edge-functions/api/index.js` must be redeployed together.

## NEW in v51.13.0 — readable AI, math and browser-only drafts

- **Universal rich rendering:** LaTeX typesets as mathematics; AI Markdown tables display as actual tables, not pipes or dash separators. Applied to Study Mode / Ask AI, Question Pool interfaces and Daily Challenges, including answer release, feedback, administrator previews and direct PDF exports. Rendering is sanitized rather than injecting raw user or AI HTML.
- **Local-first unfinished work:** Daily Challenge written drafts, active CBT sessions and Question Pool practice attempts are backed up in the current browser using IndexedDB plus localStorage recovery. Pool Study Mode navigation writes are debounced. Final submitted answers **remain on the server** so the administrator can grade or review them; local drafts are not a replacement for final submission.
- **Safer retries:** Daily Challenge final submission uses an idempotent client result token so a lost server response need not result in a second database row.
- **Design:** Blue/white/gold formatting for AI explanations, formulas and comparison tables, with phone-friendly horizontal table scrolling.
- **Deployment:** No new SQL migration for v51.13 if the existing v51.11 Daily Challenge schema is already installed. Replace all files and the EdgeOne API together. See `RELEASE_NOTES_v51.13.0_RICH_MATH_LOCAL_DRAFTS.md` and `QA_v51_13.md` for details, limitations and production smoke tests.

## NEW in v51.12.0 — UI and PDF report improvements

- New `daily-premium-v51.12.css`, loaded last, applies a legible blue-and-white design with restrained gold accents from the Gifted Brainz logo. Daily challenge welcome, submission, admin editor, and result views have refined cards, buttons, spacing, score progress, and status panels. Existing CBT and library styles remain untouched.
- Challenge question, official answer, marking rubric, and submitted student response retain original line breaks, blank lines, tabs, indentation, and consecutive spaces. The backend no longer trims these bodies before storing; it still validates meaningful content with `.trim()`. Existing already-collapsed content cannot be reconstructed automatically.
- Admin gets collapsible live previews of question/answer/rubric formatting. The student question screen and result screen use `white-space: break-spaces`. Pre-existing math rendering support is retained.
- Result title, release pill, and candidate's **name only** are centered. Subject is placed in a separate report-subtitle line. The question diagram, if attached, is now returned by the result API and shown in the report. No changes to released-answer security or grading.
- **Download PDF** is a direct browser-side export using `html2pdf.js` v0.10.1, loaded **on demand** via CDN. It excludes the browser's automatically printed document title and personal result URL. This download is based on rendered HTML (image-based PDF text, not reliably selectable). It does not require an EdgeOne API secret. Internet access to the CDN is required when first downloading. If unavailable, use the **Print** fallback with **Headers and footers disabled** in browser print settings. Webpage CSS cannot override the user's browser print-header setting.
- Browser-printed reports have styled A4 layouts and a document-generated date; `@page gbDailyResult` is scoped to the result page so other app sections' print output is not affected.
- **No SQL migration** is needed for v51.12.0 if v51.11 challenge tables already exist. Deploy **all** ZIP contents, including `daily-premium-v51.12.css`, `daily-challenge-v51.11.js`, and the updated API.

## NEW: Daily Challenge

Admin → **Daily Challenges** → **Create Challenge**. Choose title, subject, topic, difficulty, question text, official answer, marking rubric, maximum marks, scheduled answer release, and optional earlier submission deadline. Attach a question image or short video via an authenticated upload, or paste an HTTPS URL / YouTube video URL. Share the generated `?challenge=...` link. Set status **Published** before sharing.

Students see a welcome page, proceed to an **untimed written-response** form, then receive a submission acknowledgement and a unique private result link. A browser device may submit **once per challenge**. Answers are auto-saved locally while typing. No A–D options or exam timer. **Once started, Daily Challenges detect tab changes; the third detected switch triggers a 0-mark forfeiture.**

The official answer and AI grades remain hidden until `release_at`. The public challenge endpoint never returns the official answer or rubric. When a participant opens their private result link after release, the page immediately displays the released question and official answer while requesting Groq grading separately; subsequent reads reuse the stored score, including partial credit and a review flag. **Admin → Daily Challenges → Submissions** permits retrying AI grading and overriding the score and feedback manually. If Groq is unavailable or a result needs review, the result is marked pending or flagged instead of inventing a mark.

Release occurs **automatically according to the stored timestamp**, not a cron process. The result page polls while open and displays an in-app notification when released; browser alerts are opt-in and require the result page to remain open. **Background email/WhatsApp/push broadcasts are not included**: they require a messaging provider, a scheduled job, and appropriate consent. Grades are calculated when the released result is requested or an administrator grades it, not proactively at release time.

The media uploader accepts JPEG/PNG/WebP/GIF images up to 3 MB and MP4/WebM/Ogg video clips up to 15 MB, subject to EdgeOne request-body limits. Larger videos should be hosted elsewhere (e.g. YouTube) and embedded by HTTPS URL. Public question media is stored in a public Supabase Storage bucket; never upload an unreleased answer there. When question content relies on visual details not contained in the text, the grader is directed to flag the response for human review.

## Roman-numeral formatting

Roman items I., II., III., IV., etc. render in a **fixed label column** with consistent indentation and upright text. A following "Which..."/"What..."/"Choose..." question stays a separate paragraph, and extracted new numbered questions are flagged for manual separation rather than merged into the last Roman item. Corrects Question Pool, CBT, study and preview displays without changing stored existing questions.

## Deployment (required)

1. Back up your deployed ZIP and live Supabase database first.
2. In the **same Supabase project configured by `SUPABASE_URL` in EdgeOne**, run `schema_daily_challenge_v51_11.sql` in the SQL Editor. This additive migration creates only the new challenge tables and media storage bucket; it does **not** delete or modify existing CBT records.
3. If you have not previously applied v51.10.0's engagement migration, run `schema_quiz_engagement_v51_10.sql` as well; otherwise do **not** rerun old migrations.
4. Deploy all included files while preserving paths, **including** updated `app.js`, `daily-challenge-v51.11.js`, `daily-challenge-v51.11.css`, `daily-premium-v51.12.css`, `index.html`, and **`edge-functions/api/index.js`**.
5. In EdgeOne's *server-side* production environment set/retain `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (secret/service-role key), `ADMIN_PASSWORD`, `SESSION_SECRET`, and `GROQ_API_KEY` (optionally `GROQ_CHALLENGE_MODEL`). Do not put any secret in the frontend.
6. Redeploy, then visit `/api?action=health`: check `databaseOk: true`, `aiConfigured: true`, and build `v51.14.0-responsive-subject-choice-weak-areas-20261126`. Check an admin-created draft, a published link, the written response workflow, the release embargo, the result token, AI grading and a manual correction.
7. On real mobile devices, test a challenge with image/video and a Roman-numeral prompt; the production environment was not available for live browser/EdgeOne/Supabase testing here.

## Privacy and operational limits

The submission result link contains a random secret token. Keep it private, as anyone holding it can see the student's answer after release. The server stores only the SHA-256 token hash, and tables are RLS-enabled with no anon/authenticated role grants. Browser device IDs are not hardware security; clearing local storage, switching browsers or spoofing an ID can circumvent one-submission-per-device controls. AI marks are provisional and reviewable. Be clear with students that submitted answers may be processed by an AI provider for grading.

A challenge with submissions cannot have its question, marking guide, official answer or maximum mark rewritten; create a new challenge instead. Deleting a Daily Challenge removes the record and (after the v51.13.2 cascade migration) all dependent submissions; administrators should export or back up important results first. The release deadline is enforced server-side, even when a browser page is stale.

## QA

Static syntax, markup asset references, CSS parsing, Roman rendering/extraction detection, mock API security/release/grading, and admin media-upload guard tests passed. Live payment integrations are intentionally absent. See `QA_v51_11.md` for the verification scope and remaining production checks.
