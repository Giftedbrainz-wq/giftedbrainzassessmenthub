-- GIFTED BRAINZ ASSESSMENT HUB v51.11.0
-- New Daily Challenge module: untimed written submissions with scheduled answer
-- release and reviewed, rubric-based AI grading. Additive migration; existing
-- CBT tables, attempts, Question Pools and Libraries are not altered.
-- RUN ONCE in the correct live Supabase project BEFORE deploying v51.11.0.
BEGIN;

CREATE TABLE IF NOT EXISTS public.daily_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 slug text NOT NULL UNIQUE,
 title text NOT NULL,
 subject text NOT NULL DEFAULT '',
 topic text NOT NULL DEFAULT '',
 difficulty text NOT NULL DEFAULT 'Intermediate',
 question_text text NOT NULL,
 image_url text NOT NULL DEFAULT '',
 video_url text NOT NULL DEFAULT '',
 official_answer text NOT NULL,
 marking_rubric text NOT NULL,
 max_marks integer NOT NULL DEFAULT 10 CHECK(max_marks BETWEEN 1 AND 100),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 release_at timestamptz NOT NULL,
 close_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT daily_challenge_schedule_ck CHECK(close_at IS NULL OR close_at <= release_at)
);
CREATE INDEX IF NOT EXISTS daily_challenges_status_idx ON public.daily_challenges(status,created_at DESC);

CREATE TABLE IF NOT EXISTS public.daily_challenge_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 challenge_id uuid NOT NULL REFERENCES public.daily_challenges(id) ON DELETE RESTRICT,
 device_hash text NOT NULL CHECK(length(device_hash)=64),
 result_token_hash text NOT NULL CHECK(length(result_token_hash)=64),
 student_name text NOT NULL,
 answer_text text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','graded','needs_review','reviewed')),
 score numeric(6,2),
 feedback text,
 grading_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
 grading_model text,
 graded_at timestamptz,
 submitted_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT daily_challenge_unique_device UNIQUE (challenge_id,device_hash),
 CONSTRAINT daily_challenge_result_token_unique UNIQUE(result_token_hash),
 CONSTRAINT daily_challenge_score_nonnegative CHECK(score IS NULL OR score>=0)
);
CREATE INDEX IF NOT EXISTS daily_challenge_submissions_index ON public.daily_challenge_submissions(challenge_id,submitted_at DESC);

ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_challenge_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_challenges FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.daily_challenge_submissions FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.daily_challenges TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.daily_challenge_submissions TO service_role;

-- Challenge question images and video clips (public assets only, never answers).
-- All uploads go through the admin-authenticated EdgeOne API using the server
-- credential. Students have no direct upload or database permissions.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('challenge_media','challenge_media',true,15728640,
 ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/ogg']::text[])
ON CONFLICT (id) DO UPDATE SET public=true,
  file_size_limit=EXCLUDED.file_size_limit,
  allowed_mime_types=EXCLUDED.allowed_mime_types;
COMMIT;
NOTIFY pgrst, 'reload schema';
-- Verify: SELECT to_regclass('public.daily_challenges'),
--                to_regclass('public.daily_challenge_submissions');
