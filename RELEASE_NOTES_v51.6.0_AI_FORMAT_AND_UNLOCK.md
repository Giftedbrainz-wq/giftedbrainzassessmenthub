# Gifted Brainz Assessment Hub — v51.6.0

## Changes from v51.5.0

The AI learning assistant is still limited to **Question Pool Study Mode**. The current release improves its presentation and controls when students can access it. It does not grant AI access to a timed CBT or Practice Mode.

### 1. Ask AI unlocks only after answering and viewing feedback
- The Ask AI button is hidden until the question has been answered and the server has returned the correct answer and explanation.
- The correct answer is now stated clearly, even when the student selected it correctly. The AI button appears **below that feedback**, ensuring the answer is presented first.
- The AI panel's open, new-chat and message functions also check the same condition in the browser.
- Crucially, the `pool-study-ai` API reads the current device's Study Mode progress from Supabase and rejects AI requests when no answer is recorded for the exact question. This cannot be bypassed by simply revealing a hidden browser button.
- Study sessions resumed on the same device now restore feedback for previously answered questions so those students do not get stuck with a permanently locked AI button. Unanswered questions never receive a hidden answer key.
- Retrying an already submitted Study Mode answer returns the saved answer's feedback rather than modifying the recorded answer. The server validates that the question belongs to the current Study Mode session.

### 2. Organised, readable AI explanations
- Added a safe explanation renderer in `study-ai-format-v51.6.js` for section headings, paragraphs, numbered steps, bullets and display maths.
- Rendered maths uses the site's existing KaTeX library. A readable fallback is provided for common maths notation when the library cannot render an expression.
- AI system instructions now request logically ordered steps, clearly named sections and correctly delimited maths rather than walls of text, stray symbols and raw LaTeX.
- All response text is escaped before it is placed into HTML; untrusted model content cannot inject arbitrary HTML.
- The matching styles are in `study-ai-richtext-v51.6.css`.

### 3. Rounded Ask AI dialogue
- Desktop AI panel floats slightly in from the top/right/bottom with a rounded 24px perimeter rather than a hard-edged rectangle.
- On narrow screens the panel is a rounded top-corner sheet, while retaining full usable width.
- Conversation cards, entry panels and message composer also have softer corners. Navy/gold/white styling remains unchanged.

## Deployment

1. Back up the current Assessment Hub code deployment and Supabase data. This is a **source-code update only**: no new SQL migration for v51.6.0.
2. If updating from **before v51.5.0**, first apply `schema_study_ai_v51_5.sql` to the Assessment Hub's existing Supabase database and ensure the server-side `GROQ_API_KEY` and session-secret configuration are present.
3. Deploy the full ZIP to the existing Assessment Hub EdgeOne deployment (do not deploy it to EduSpace). Verify all source files upload, including `study-ai-format-v51.6.js` and `study-ai-richtext-v51.6.css`.
4. Clear browser/CDN caching as necessary: `index.html` references v51.6.0 asset URLs.
5. On a **test** pool question: before answering, confirm Ask AI is absent. Answer and wait for feedback; confirm the correct answer appears and then Ask AI appears. Open the dialogue and test mathematics, formatted steps, follow-up chat and mobile rounded corners.
6. Resume an answered Study Mode question on the same browser/device and verify its feedback and Ask AI are restored. Verify that an unanswered question remains locked.
7. Confirm AI is still absent in timed CBT and Practice Mode; confirm the original CBT Library results buttons remain intact.

## Automated verification

- `npm run check` — syntax and Python compile checks.
- `npm test` — existing regression suite plus `tests/study-ai-v516-gate-format.mjs`.
- Automated tests passed locally. **Live Groq responses, production Supabase and live device/browser deployment have not been tested.**
