# Gifted Brainz Assessment Hub v50.1.0 — 1,000-question document extraction

## Implemented
- **One document upload can extract up to 1,000 questions**, including question number 1000 (previous local number matching stopped at three digits).
- Structured documents (PDF, DOCX, TXT and CSV with clearly numbered questions and A–D options) are parsed locally; answer-key entries and source-page markers are retained.
- Documents not reliably recognised by the local parser are processed in smaller, question-boundary-preserving AI extraction batches. The browser no longer sends only the first 180,000 characters of the entire file and quietly omits the rest. Relevant answer-key and explanation entries are passed to the corresponding batches where identifiable.
- Review now displays 25 editable questions per page with Previous and Next, rather than rendering 1,000 editable cards at once.
- **Save all** imports up to 1,000 reviewed questions using ten 100-question API requests. The existing backend 500-question *per-request* limit remains in place, and requires **no database migration**.
- If a save batch fails, earlier confirmed batches are retained in the question bank and the remaining unsaved questions stay in the review editor. The UI reports the confirmed saved count. If a network request fails after the server commits but before it replies, manually check the bank before repeating that specific batch to avoid duplicates.
- The review UI and local extraction now explicitly reject numbered files containing more than 1,000 questions rather than truncating the list.
- DOCX reading now retains paragraph and line boundaries more reliably.
- Cache keys/version incremented to v50.1.0.

## Scope / limitations
- This is an **upload and extraction limit**, not a claim that a single AI inference produces 1,000 questions. AI batches depend on provider availability, rate limits, input formatting and output quality; some sources still require manual review.
- Current file size cap remains 20 MB. PDFs made entirely of scanned images may lack extractable text; OCR was not added.
- Each saved question still requires four options and a confirmed correct answer. Missing information must be reviewed; the importer does not silently guess.
- The legacy `ai-generate` question creation limit (200) and the server-side per-request batch-save limit (500) are unrelated to the document upload limit and were not changed.
- Live Supabase/EdgeOne and actual Groq calls were not exercised in this environment. The complete 1,000-question local TXT import and review pagination were exercised in Chromium, while the save flow was tested using a mock API.
