-- Gifted Brainz Assessment Hub v51.15.0
-- REQUIRED before deploying v51.15 edge functions. Execute as a database
-- administrator in the existing Supabase project SQL Editor.
-- This migration preserves all existing records and can be rerun safely.

-- Original handwritten Daily Challenge images are privately stored in Storage;
-- the submission row keeps only the private object path.
ALTER TABLE IF EXISTS public.daily_challenge_submissions
  ADD COLUMN IF NOT EXISTS answer_image_path text;

-- A cached personalised revision report avoids repeated paid AI calls.
-- The timestamp coordinates short-lived requests and supports retries.
ALTER TABLE IF EXISTS public.attempts
  ADD COLUMN IF NOT EXISTS ai_review text;
ALTER TABLE IF EXISTS public.attempts
  ADD COLUMN IF NOT EXISTS ai_review_started_at timestamptz;

-- Private bucket: NO public URL, no user SELECT or INSERT policy. All storage
-- access occurs through server API with SUPABASE_SECRET_KEY and admin auth.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('daily_answer_images','daily_answer_images',false,1200000,ARRAY['image/jpeg']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Optional check (read-only):
-- SELECT id, public FROM storage.buckets WHERE id='daily_answer_images';
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='daily_challenge_submissions'
--     AND column_name='answer_image_path';
