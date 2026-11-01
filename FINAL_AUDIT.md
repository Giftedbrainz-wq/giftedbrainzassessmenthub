# Gifted Brainz Assessment Hub — v37 Contrast Audit

## Root cause found
The prior v36 source already contained several contrast fixes, but `index.html` still loaded `styles.css` and `app.js` with the old `v31-visibility-result-20261001` cache-busting query. A browser/CDN could therefore keep serving the older CSS/JS and make the fixes appear not to have been implemented.

## Fixes
- Updated asset cache-busting to `v37-contrast-20261002` for both `styles.css` and `app.js`.
- Added explicit light/dark text colours for student cards, result cards, question surfaces, navigator, admin cards, modals, forms and empty/error states.
- Added explicit contrast rules for generated/AI live previews and explanation previews.
- Added explicit dark student confirmation-modal styling.
- Added explicit button text rules so `.sub` metadata inside gold primary buttons cannot inherit muted text.
- Preserved the compact WhatsApp banner's white text on green background.
- Reinforced leaderboard cell/header colours and highlighted first-row contrast.
- Kept input/placeholder colours explicit for dark admin/student themes.

## Previous screenshot issues addressed
1. Faint generated-content preview text on light surfaces.
2. Faint text in the Submit CBT confirmation modal.
3. Faint “Unlimited attempts” text inside the gold Retake button.
4. Pale leaderboard headings / “Unknown” on the highlighted first row.
5. Public CBT library title/description contrast.
6. Result/no-result/error-state contrast.

## Validation
- `npm run check` passed: app.js and edge-functions/api/index.js syntax valid.
- `python -m py_compile test_server.py` passed.
- Confirmed the HTML no longer references the stale v31 asset query.
- Release ZIP integrity checked after packaging.


## v42 export and rank-neutrality update — 2026-10-02
- Replaced the previous leaderboard PNG podium/poster composition with a completely different landscape institutional-results bulletin format.
- Export uses a clean header, summary metrics and table; there is no podium, medal treatment or special first-place colour.
- Removed the brown/gold first-row highlight from on-screen official leaderboards; ranks are presented as neutral numeric values.
- Frontend cache-busting advanced to v42.

## v45 reliability correction — 2026-10-02
The v45 package addresses reports that some students could see a score while their score was absent from the leaderboard, and that some students did not receive a visible score after submission.

- Submission response handling now retries the idempotent `attempt` endpoint once on transient network/gateway failures.
- The leaderboard no longer uses a first-attempt-only filter. It selects the latest submitted attempt per device and then ranks those participant records.
- Public/student, shared-result and admin leaderboard endpoints use the same participant selection rule.
- Each attempt receives a private result token and the student result page can copy that personal result link.
- Previously saved results can be recovered from the same browser after results are released.
- No leaderboard visual design was changed by this correction.


## v46.0.1 focused security and regression audit — 2026-10-16

### Defect found and corrected
The private-library review found one remaining path: the `attempt` submission/idempotent retry endpoint could return a stored score and correction content for an already-submitted attempt without re-checking the current private-library device authorization. The endpoint now performs the same library/device check before returning result content. The browser includes its device ID on attempt submission/retry calls.

### Verification
- JavaScript/API and Python syntax checks: PASS.
- 13/13 mocked API regression tests: PASS.
- Tests cover public-library access, private-library denial and required message/device ID, approval, direct quiz/media/attempt-start/attempt-submit/leaderboard/result-token protection, first-attempt leaderboard selection, administrator-only code issuance, hashed single-use activation, activation-code format, expiry enforcement and device binding.
- Frontend-to-API action scan: 40 literal frontend actions, no missing routes.
- HTML parse: PASS; CSS top-level parse errors: 0; archive integrity: PASS.

### Limitations
No live Supabase database or EdgeOne deployment transaction was executed. The browser runner was blocked from connecting to the local test server, so visual/browser runtime testing remains unverified. Device IDs are browser-local and client-provided; they are not hardware-backed and can be spoofed. Run the migration and the public/private/access activation checks in the actual deployment before relying on this access control.
