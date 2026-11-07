# QA — Gifted Brainz Assessment Hub v50.1.0

- `npm run check`: JavaScript syntax for app and EdgeOne function, and Python test-server syntax — PASS.
- `npm test`: 22 private-library regression checks + 15 Brainz Biltz checks + 7 new extraction/save regression checks — **44 passed, 0 failed**.
- Structured local parser: 1,000 numbered questions, including #1000, plus answer key — PASS.
- Oversized input: 1,001 numbered questions rejected with explicit limit notice — PASS.
- AI chunk planner: 1,000 questions partitioned without dropping numbered blocks — PASS (mock planner; live Groq not tested).
- Save flow: 1,000 questions sent in ten 100-question API batches — PASS (mock API).
- Simulated batch failure: 300 confirmed saved, 700 remain for safe review/retry — PASS.
- Browser: Chromium injection renders 25 review cards at a time with 40 pages; pagination works at desktop/mobile widths — PASS.
- Browser: Uploaded a real synthetic 1,000-question TXT file to input, verified all 1,000 extracted and review pages appear — PASS.
- Live EdgeOne/Groq/Supabase extraction and insertion, and large real-world PDFs with diagrams — NOT VERIFIED; test in staging before deploying to production.
