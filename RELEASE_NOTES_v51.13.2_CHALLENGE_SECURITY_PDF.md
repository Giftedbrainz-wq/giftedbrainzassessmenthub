# Gifted Brainz Assessment Hub 51.13.2 — Daily Challenge exam integrity, deletion & PDF layout

This is an in-place upgrade from **v51.13.1**. Existing CBT, Question Pools,
Study Mode, LaTeX display, local drafts, answer releases, and AI grading are retained.

## 1. Daily Challenge tab-switch integrity

- Enforced once a participant selects **Yes, I'm Ready** to start the Daily Challenge.
- Records each `document.visibilitychange` event where the page becomes hidden.
- Shows a visible warning when the student returns after the first and second switches.
- **Third detected tab switch automatically submits the challenge as a 0-mark forfeiture**, even if the answer is unfinished. No AI tokens used on a forfeiture.
- Shows the rule and warning count on the student screen before/during the attempt.
- Saves warning count, lock state and unfinished answer locally so a reload does not automatically reset the count.
- If the request times out, the attempt remains locked and the user can retry delivery; no client-side auto-unlock.
- Existing CBT proctoring (3 switches = auto-submit) is left unchanged.

**Limitations:** A browser app cannot prevent a student from physically switching tabs or completely stop intentional bypass by clearing browser storage, disabling scripts or using another device. Tab visibility is imperfect in split-screen/embedded browsers; the app records detected events only. Use a secure exam environment for high-stakes proctoring.

## 2. Permanent challenge deletion

- Admin dashboard now has a **Delete** action instead of Archive.
- An explicit, destructive confirmation warns that all submissions, scores, feedback and result links will be removed.
- Admin backend performs a **real DELETE** of the challenge, no status='archived' substitution.
- A database FK cascade removes related submissions in the same database transaction.
- Admin editing offers only Draft and Published. Existing archived records remain visible for deleting or republishing.
- Permanent deletion cannot be undone. **Backup important records first.**
- Media uploaded separately to the challenge_media bucket are **not** automatically deleted, as they may be referenced by other challenges. If necessary, remove unused media with appropriate storage controls.

**Required migration:** Run `schema_daily_challenge_delete_v51_13_2.sql` once in the Supabase SQL Editor before attempting to permanently delete challenges. Without it, Supabase blocks deletion when student submissions exist. This upgrade does not erase any existing challenges by itself.

## 3. Student input and LaTeX

- Removed the expandable Live Answer/LaTeX Preview on the Daily Challenge student side.
- Student text is saved **exactly as typed** and sent to AI for interpretation and grading.
- KaTeX/rich formatting is still available for the *question*, *admin preview*, *released answers*, *feedback* and *PDF*.

## 4. Organised results PDF

- The Download PDF action captures the **same headed, coloured, separate result sections that students see in their answer view**.
- Keeps paragraph breaks, list indentation, mathematical notation and structured answer tables.
- Prevents orphaned headings and reduces page splits within short paragraphs and table rows.
- Enlarges PDF typography, aligns the paper width to A4 content, improves the question/answer card hierarchy.
- Keeps the clean standalone PDF (no EdgeOne URL or browser header/footer). Date generated remains in the document.
- The Download PDF button still loads `html2pdf.js` from Cloudflare CDN; verify availability on deployed networks.

## Deployment

1. Back up Supabase daily_challenges and daily_challenge_submissions if important.
2. Run `schema_daily_challenge_delete_v51_13_2.sql` in the live Supabase SQL Editor.
3. Replace all deployed files with this complete ZIP, including `edge-functions/api/index.js`, `index.html` and the new CSS.
4. Test one dummy challenge: start → tab switch twice → third switch triggers forfeiture → released 0-mark result. Use another dummy to test normal submission.
5. Test **Delete** on an unimportant challenge with and without submissions and verify it disappears from the admin list and its result links cease to work.
6. Check a long, multi-paragraph answer, a table, and LaTeX in the downloadable PDF on a phone and a laptop.

## Not verified against production

This package was tested locally with browser simulations and source checks, not against real EdgeOne + Supabase + Groq. Live authorisation, storage FK migrations and CDN-dependent PDF generation require production checks. Use backup and a dummy test challenge before deleting real results.
