# v51.11.0 — Daily Challenge & Roman-Numeral Refinements

- New independent admin-managed written-response challenge system: text, images, uploaded clips or YouTube links; title/subject/topic/difficulty/marks; official answers/rubrics; draft/published/archived state; optional submission deadline; scheduled solution release.
- Public, shareable challenge welcome screen and untimed written-answer editor; one submission per browser/device; autosaved text draft and personal result link.
- Server-enforced release embargo; individual results protected by hashed opaque token. Rubric-guided Groq assessment on result retrieval after release, partial marks, feedback, human-review flag, admin override and grade retry.
- Admin challenge list and submission viewer with participation/grade statistics, average scores, and manual review form.
- Polling on the student's active result page and optional browser alert when release is detected; NOT background push/email/WhatsApp delivery.
- Roman I–X items aligned to a fixed grid label column; subsequent question prompt separated; possible merged imported questions flagged during review and rejected by server validation for new saves.
- Added additive `schema_daily_challenge_v51_11.sql`. Requires existing Supabase/EdgeOne backend and GROQ_API_KEY; no Paystack.
- Retained v51.10.0's compact private-library screen, WhatsApp contact, mock views/attempted badges and prior features.
