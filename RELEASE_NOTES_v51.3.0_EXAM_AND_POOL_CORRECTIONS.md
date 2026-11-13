# Gifted Brainz Assessment Hub 51.3.0 — Student CBT and Question Pool corrections

Based on full supplied Assessment Hub 51.2.0 source. This is a code update, not an already deployed website.

## Fixes
- Study / practice pool questions now fetch the *existing* linked passage text from `passages` on each request. An actually absent database passage remains flagged; original passage text cannot be reconstructed without its source. Do not replace original passages with invented ones.
- CBT Library: responsive desktop card grid; Start Assessment uses quiz link, Results & Review uses the quiz **released results link**, and unreleased results show a disabled label.
- Result-unavailable pages return candidates to the referring CBT Library instead of the administrator sign-in page.
- Store the candidate's preferred name locally, with a change-name control and first-time opt-in; subsequent CBTs can skip repeat name entry unless an administrator added other required fields.
- Remove the Brainz Biltz *blocking missing device ID error* by including the existing silent browser identifier automatically when registering. Anti-cheat constraints and private-access protections are not bypassed.
- Quick copy of previously released results URLs without needless release/network operations.
- Updated calculator icon and calculator that handles decimal entry (`0.8`), parentheses, common operators and error states without `eval`.
- Improved mobile and desktop student CBT controls, gold-accented completion progress, and roomier Question Pool topic cards. Navy remains dominant; gold is secondary.

## Deployment
1. Back up Assessment Hub Supabase, EdgeOne deployment and environment settings.
2. Deploy the entire source ZIP to the existing Assessment Hub project; preserve all production secrets.
3. Test a quiz with released and unreleased results links, student saved-name flow, a Brainz Biltz registration, comprehension pool with preserved passages and a truly orphaned passage ID, the calculator and CBT desktop/mobile layouts.
4. No new SQL migration introduced for these front-end and data-query changes; no live Supabase or EdgeOne deployment was run here.
