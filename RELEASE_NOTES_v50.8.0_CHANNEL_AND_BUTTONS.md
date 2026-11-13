# Gifted Brainz Assessment Hub v50.8.0 — channel prompt and button readability

## Changes
- Compact "Follow our WhatsApp Channel" welcome dialog on eligible Hub landing screens, using the established channel URL.
- Dismissal remembered for seven days; clicking Follow suppresses the prompt for 30 days. It does not verify whether a student followed WhatsApp.
- The dialog is suppressed while students are answering CBT questions or viewing a submission/result/challenge screen; it does not interrupt an active examination.
- WhatsApp channel banner and call-to-action are visibly green, with white text.
- High-contrast action styles applied after older CSS overrides: Create CBT, Save Changes, Submit CBT and related primary actions now have navy/blue backgrounds and white text. Secondary and result/review buttons remain white with dark readable text. Admin hero primary action retains gold with dark text.
- Preserves the previously implemented EduSpace link field and Return to EduSpace result action.
- Static resource URLs bumped to v50.8.0 for cache invalidation.

## Verification
- `npm run check`: passed.
- Full `npm test` regression chain returned exit code 0, including secure pairing, private CBT access, grading, result integrity, mobile layout, admin controls, and the new action/button tests.
- Headless-browser HTML/CSS rendering verified green WhatsApp controls, readable primary/secondary buttons, white result/review controls and no mobile horizontal overflow. The landing popup appeared and closed; a simulated active CBT did not show the popup.

## Deployment
- Deploy the entire project. Hard refresh affected browsers to replace old CSS/JS.
- The existing EduSpace linking setup still requires the Supabase SQL migration `schema_eduspace_device_link_v2.sql` and matching deployment secrets. This update does not replace those requirements or apply migrations automatically.
- Verify the channel dialog, admin actions, CBT submission and Return to EduSpace against the live deployed backend. Existing student records are not removed.
