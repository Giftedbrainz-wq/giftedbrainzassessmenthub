# Gifted Brainz Assessment Hub v51.15.3 — English passage root-cause fix

## Confirmed root cause in v51.15.2

The original uploaded `Use_of_English_60_Questions.txt` placed a **complete, repeated passage inside the text of each numbered question** for questions 1–15, rather than in a shared passage block. The v51.15.2 local importer only recognised passages placed BEFORE question numbers, so it treated all 60 questions in that original file as ordinary multiple choice. It then saved the entire passage as part of the stems for Q1–15. The v51.15.2 student display improvement could not solve text already embedded inside the question stem. This problem was directly reproduced with the supplied original and earlier importer.

**Do not mistake a collapsed reading control for a duplicated passage.** New displays now keep full passage prose out of question cards after the first linked question, and expose a dedicated "View passage" button if a student wants to consult the reading again.

## Fixes

1. The local TXT importer now recognises BOTH supported layouts:
   - A single titled passage before a numbered group of questions; and
   - Older documents placing the same titled passage inside EACH numbered question.
2. For the older layout, it extracts the passage title and body, removes attribution lines, separates the real question stem from the passage, and detects explicit question-range instructions (e.g. questions 1–5, questions 6–15) to terminate the passage group. When an embedded passage cannot be safely separated, import fails rather than quietly saving a long, incorrect stem.
3. Both normalised TXT imports are now deterministically parsed locally; no AI-extraction fallback is needed for the attached 60-question English sources.
4. Student/Question-Pool display and public CBT API can render **previously saved** old-format question stems correctly without updating existing database records. Existing attempt scores and history are preserved.
5. A narrowly fingerprinted compatibility safeguard for the supplied 60-question English mock suppresses incorrectly inherited passage links on Q16–60 when earlier imported data already contains those incorrect links. It does not act on unrelated CBTs or change stored Supabase rows.
6. Exam display shows the complete passage on the first question in the group. On later questions, it provides a compact **View Passage** button. Passage text is inserted into a dialog only when opened; the full passage is no longer part of each successive question's main display.
7. Browser app and EdgeOne API both patched; updated bundle cache version to `51.15.3`.

## Verified local checks

- Reproduced v51.15.2 root bug: 0 passage-linked questions, first 15 question stems containing repeated passage prose when importing the original file.
- Repaired parser: all **three** supplied versions of 60-question English TXT parse to **5 reading-linked + 10 cloze-linked + 45 standalone**, with 4 choices, answer key and explanation for every question.
- Correct passage title and text per group; no source attribution embedded in questions or passages.
- Previously saved malformed questions (old question.text containing passage): API and client normalization remove embedded passage text from displayed stems, preserving question IDs and answers.
- Simulated pre-existing wrong passage links on all 60 questions: exactly Q1–15 remain associated with passages on the specifically identified uploaded mock; Q16–60 are standalone in the student view.
- JavaScript syntax checks for main app, EdgeOne API and other application scripts pass.

## Deployment and limits

1. Back up your existing deployment and Supabase data.
2. Deploy the **complete v51.15.3 ZIP**, not only the TXT. Replace both `app.js`, `index.html`, `upgrade-v51.15.2.css`, and `edge-functions/api/index.js`, retaining all other project files and environment bindings.
3. Ensure the web app loads `app.js?v=51.15.3`; clear browser cache/hard reload after deployment.
4. For a **new** import use `GIFTED_BRAINZ_USE_OF_ENGLISH_60_v51_15_3_IMPORT.txt` from the download; you can now also re-import the original legacy TXT safely into a new DRAFT CBT.
5. In AI Question Studio, confirm `60 questions extracted locally · 15 passage-linked · 45 standalone` BEFORE saving.
6. Test Q1 and Q2 (one shared reading passage), Q6 and Q7 (one shared cloze), Q15 and Q16 (passage ends), Q26 and Q60 (no passage controls), and the student exam.
7. The display compatibility layer does **not rewrite old Supabase rows**. This intentionally avoids corrupting existing attempt records and grading. To permanently cleanse old database content, make a new draft CBT using the corrected source and retire the old draft after carefully preserving student results; or perform a scoped, backed-up database migration after inspecting affected record IDs.
8. There was **no live EdgeOne/Supabase browser verification** here. Tests prove the importer and the API's legacy display mapping against the supplied source and simulated stored rows. Confirm the specific deployed version and live saved records in your environment.

No additional SQL migration is required solely for this v51.15.3 passage fix. Existing setup migrations from earlier versions still apply if not already run.
