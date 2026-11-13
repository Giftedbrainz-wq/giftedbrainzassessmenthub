# Gifted Brainz Assessment Hub v51.5.0
## Results & Review always visible + Study Mode Ask AI

Base release: **v51.4.0 Question Pool Examination Polish**. The updated GitHub ZIP contains the complete existing project, not just a separate patch. All original assessment and administration files are retained.

### 1. CBT Library — Results & Review
- Every published assessment card shows the **Results & Review 📊** link, whether or not the results are currently released.
- The link goes to `?result=<result_slug>&library=<library_slug>`. Older published CBTs that lack `result_slug` use their existing quiz UUID as a link fallback.
- The server's **result-access** endpoint checks the published CBT, any private-quiz/private-library/Brainz Biltz access rules, the per-device result record, and the result-release settings. **No unreleased results are exposed.**
- The CBT Library no longer shows **Results not yet released** or disables the link. The results page handles those statuses and offers return navigation to the CBT Library.

### 2. Question Pool Study Mode — Ask AI
- Every question in **Question Pool → Study Mode** has an Ask AI button; not present in timed Practice Mode or live CBT.
- On first click, a navy/gold/white panel opens and automatically requests a step-by-step explanation for the current question.
- Context retrieved **server-side** includes the actual question, options, subject/topic, stored answer and explanation, and original linked comprehension passage if present. The browser does not supply the authoritative answer or passage.
- Quick actions: Explain simply, Why not the others?, Give me a hint, Another method, Similar questions, and Explain the passage (only when a passage is linked). Students can paste their own working and ask the tutor to locate a mistake.
- Follow-up chat remains connected to the current question; conversations are kept in the current browser session and are scoped separately for each question. **New chat** resets only the current question's AI conversation.
- Maths is safely rendered using existing LaTeX/KaTeX support. The interface is responsive for desktop and mobile.
- Output explicitly distinguishes independently calculated solutions from the stored answer if they conflict. AI responses are advisory, not automatically written back into the Question Bank.

### 3. Secure AI backend / cost controls
- New endpoint: `POST /api?action=pool-study-ai`.
- Requires an existing Question Pool Study Mode session for the same device ID, confirms the question belongs to the selected topics and pool, and checks private-pool permission.
- Uses existing server-only `GROQ_API_KEY` and `GROQ_MODEL`. Optional `GROQ_STUDY_MODEL` can select a separate study model.
- System instructions treat question/passage text as untrusted source data. The provider API key is never given to browsers.
- Requests have strictly limited message/history length, a 28-second provider timeout, output-length cap and server-enforced quotas.
- The new Supabase `gb_study_ai_reserve_v1` function atomically reserves usage: 6 calls per minute per device, 60 per day per device, and 150 per hour per IP (hashed with server secret). When quotas or the provider are unavailable, calls fail without providing guessed answers.
- No training or live exam answer assistance is added to timed CBTs. AI requires a configured Groq account and may incur provider usage charges.

## REQUIRED DEPLOYMENT ORDER

1. **Back up** the active Assessment Hub EdgeOne deployment and Supabase database.
2. In the **existing Assessment Hub Supabase project**, use SQL Editor to run **`schema_study_ai_v51_5.sql`**. The migration is additive and safe to rerun. For a brand-new database, `schema.sql` also includes the definitions. **Do not replace the production database with a new one.**
3. Verify that the EdgeOne API has existing server-side `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SESSION_SECRET` and `GROQ_API_KEY` configured. Keep secrets out of frontend assets. Optional: set `GROQ_STUDY_MODEL` to a supported provider model, otherwise the existing `GROQ_MODEL` is used.
4. Deploy **the full ZIP contents** to the existing Assessment Hub EdgeOne project. Keep the `edge-functions/api/index.js` path and original site configuration. No EduSpace update is needed.
5. After deploy, clear site cache / test with a fresh tab; the new HTML points to `app.js?v=51.5.0` and `study-ai-v51.5.css?v=51.5.0`.
6. With real test data, open a CBT Library containing an unreleased CBT. Confirm the Results & Review link opens the result page and does not show marks before release. Then release results and confirm the correct student's result is shown.
7. Open a Question Pool Study Mode question on mobile and desktop. Ask AI to solve, request a hint, send a follow-up, switch to another question and back, then test New chat. Test a comprehension passage and a calculation question. Confirm there is no Ask AI button in timed practice/examination.
8. Confirm provider usage limits and logging; prevent abuse and monitor AI costs.

## Tests performed in isolated development environment
- `npm run check` (JavaScript syntax, Python test syntax).
- `npm test` (all existing release checks plus v51.5 mocked API tests and v51.2/v51.3 compatibility tests).
- `python tests/ui-smoke-v515.py` (headless desktop and mobile mock-data interaction tests, screenshots; no live web or provider traffic).
- New test covers: permanent results link, valid study-session context, missing/incorrect device IDs, unsupported actions, server-resolved correct answer, follow-up history, quota rejection, and secret-safe provider failures.

**Not tested:** Actual live Groq API requests, real Supabase migration execution, EdgeOne production deployment, or user data. Complete the deployment checklist before promoting to students. AI responses can be wrong and should be checked.
