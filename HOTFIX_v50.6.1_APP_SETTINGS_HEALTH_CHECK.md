# Gifted Brainz Assessment Hub v50.6.1 — App Settings Health Check Hotfix

## Symptom
`app_settings: Supabase app_settings request failed at Supabase (HTTP 400): column app_settings.id does not exist`

## Cause
`GET /api?action=health` looped over all required tables using `select=id&limit=1`, but `public.app_settings` has `key` (text primary key), `value`, `updated_at` and **no `id`**. Its legitimate data reads and writes already use `key`.

## Code fix
`edge-functions/api/index.js`: for `app_settings` the health query uses `select=key&limit=1`, keeping `select=id&limit=1` for other tables.

## Deploy
Replace **only** `edge-functions/api/index.js` on the existing EdgeOne deployment, or deploy the full v50.6.1 ZIP. Keep the same Supabase database and existing settings. No SQL migration is required **for this fix**; the v50.6.0 Brainz Biltz schema migration is a separate prerequisite for the 17 feature changes, if not already applied.

Recheck the Assessment Hub's database/health status after deployment. No live Supabase project was accessed in producing this hotfix.
