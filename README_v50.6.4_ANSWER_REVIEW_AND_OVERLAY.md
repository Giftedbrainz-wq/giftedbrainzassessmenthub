# Gifted Brainz Assessment Hub v50.6.4

Release type: focused correction to v50.6.3. All previous Assessment Hub features, including v50.6.0–v50.6.3 fixes, are retained.

## Corrections

1. **Safer TXT answer-key extraction.** The local numbered-question importer reads the `Answer Key` section separately from `Explanations`; explanation prose starting `1. A ...` will no longer overwrite a valid source answer. Conflicting duplicate answer-key entries for the same question are marked unresolved and require administrator review.
2. **Shuffled-option review consistency.** The test records canonical original answer indices for server-side marking, while the immediate corrections screen reconstructs the option order the candidate saw. It highlights the original selected answer correctly. A result reopened without its attempt's presentation history displays the canonical original option order, preserving option text but possibly changing the displayed letter.
3. **Question-import quality controls.** Four different choices are required in newly saved questions. Extracted keys without a confirmed answer no longer preselect A. Explicit conflicts between the selected key and explanation are flagged and blocked at save; a visible answer text preview supports human review. These checks cannot validate scientific correctness of all answer keys automatically.
4. **Correction review display.** Removed per-question “1 mark” / “2 marks” labels from both the submitted-result modal and shared-result review. Overall result/aggregate marks remain available elsewhere.
5. **Softer correct/incorrect colours.** Replaced very dark green/red corrections with lighter, high-contrast pastel green/red across review, practice and study feedback.
6. **Full-screen overlays over the fixed menu.** Admin and student editing/review modals appear above the pinned navigation/sidebar while active, then the sidebar returns unchanged when the modal closes. Earlier main-layout fix remains intact.

## Verification

- `npm run check` — passed (JavaScript syntax and Python compilation).
- `npm test` — passed including all existing regression suites and new answer-integrity regressions.
- Answer-key vs explanation contamination, conflicting keys, shuffled-option selection, review, and validation checks — passed.
- Visual layout fixture tested at 1440, 900, and 390 CSS-pixel viewport widths — overlays above sidebar and main content width > 100px.
- ZIP integrity, complete extraction, and entry-by-entry comparison — passed.

## Deployment

1. Back up the existing deployment and avoid deleting your Supabase tables.
2. Deploy this complete v50.6.4 package over the v50.6.3 application.
3. Force-refresh the administrator and student browsers (Ctrl+Shift+R or mobile page refresh).
4. Test a locally imported question set with an answer key and explanations, and a CBT with shuffled options turned on.
5. Open the Question Builder and View Corrections and check that each overlay covers the fixed navigation as intended.

**No new Supabase schema migration** is introduced in this release. The earlier v50.6.0 migration is still needed for installations that have not applied it.

**Important limitation:** This change does not independently re-evaluate the academic truth of previously saved answers, change historic student scores, or correct source material containing wrong answer keys. Existing inaccurate keys must be reviewed and edited by an administrator before using those questions in examinations. Live deployment and connected-Supabase acceptance tests have not been performed here.
