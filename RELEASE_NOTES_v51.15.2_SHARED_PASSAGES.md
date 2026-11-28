GIFTED BRAINZ ASSESSMENT HUB v51.15.2
ENGLISH SHARED-PASSAGE DISPLAY AND EXTRACTION PATCH

PROBLEM:
A passage was being displayed repeatedly for every linked question, making the
exam and extraction-review screens feel as if the entire passage had been
attached separately to each question. Older versions could also leak the most
recent passage into independent questions after a section boundary.

FIXES:
1. Parser explicitly terminates passage association at END OF PASSAGE, END OF
   COMPREHENSION, END OF CLOZE, and subsequent SECTION headings.
2. New English mock import: Q1–5 reference Comprehension Passage I; Q6–15
   reference Cloze Passage I; Q16–60 have NO passage link.
3. Extraction-review screen presents a shared passage editor only once per
   group. Other linked questions display a compact reference to that passage.
4. Student examination screen displays the full passage at the start of its
   group. Subsequent linked questions display a small "Read [title]" control
   that expands on demand. Unrelated questions display no passage controls.
5. Question Bank and corrections use collapsed shared-passage views instead of
   repeatedly filling cards with the full passage text.
6. The import review now reports the number of passage-linked versus
   standalone questions.
7. Passage-title text is retained, while source attributions have been removed
   from the provided English TXT file.

CONFIRMED VALIDATION:
- node --check passes for all application scripts.
- Local importer parses 60 questions with valid A–D options and answer keys.
- Exactly Q1–5 = comprehension, Q6–15 = cloze, Q16–60 = standalone.
- No section delimiters or passage titles appear inside answer options.
- No source attribution appears in either passage.
- Small custom passage-boundary regression passes.

IMPORTANT FOR ALREADY-SAVED CONTENT:
Importing the corrected TXT or deploying this patch DOES NOT rewrite previous
question records already stored in the database. If you previously imported
the buggy 60-question set, preserve any attempts/results and back up your data.
Review the older imported questions and remove the mistaken links for Q16–60,
or create a NEW CBT and import the corrected file, verify it and then retire the
old draft. Do not delete an existing assessment that already has student results.

DEPLOYMENT:
- Replace the files with this complete ZIP, preserving environment bindings.
- Clear cached app.js, or ensure index.html uses ?v=51.15.2.
- No new database migration is required for this display/import patch.
- Test an English mock before publishing: Q1, Q2, Q5, Q6, Q7, Q15, Q16, Q25,
  Q26 and Q60; switch directly between questions and exercise Read Passage.
- This package has been static/Node tested, not verified against your live DB.
