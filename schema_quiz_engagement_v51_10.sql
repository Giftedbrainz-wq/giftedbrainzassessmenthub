-- Gifted Brainz Assessment Hub v51.10.0
-- One-time, additive migration for mock CBT views and completed-attempt audience counts.
-- Execute in the Supabase project used by the live EdgeOne Assessment Hub.
-- This does NOT modify/delete any existing questions, attempts, student results or CBTs.

BEGIN;

-- One record per quiz and unique browser device. The API hashes the browser device ID
-- before writing. Neither raw device IDs nor names are stored here.
CREATE TABLE IF NOT EXISTS public.quiz_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  visitor_hash text NOT NULL CHECK (length(visitor_hash) = 64),
  first_viewed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quiz_views_quiz_visitor_unique UNIQUE (quiz_id, visitor_hash)
);

CREATE INDEX IF NOT EXISTS quiz_views_quiz_id_idx ON public.quiz_views(quiz_id);
CREATE INDEX IF NOT EXISTS attempts_quiz_status_device_v5110_idx
  ON public.attempts(quiz_id, status, device_id);

-- One summary per quiz. Views are unique browser/device IDs that successfully opened
-- the CBT; attempted counts unique browser/device IDs with a SUBMITTED attempt.
-- Old submitted attempts with no recorded device ID each count as one (best effort).
CREATE OR REPLACE VIEW public.quiz_engagement_stats AS
SELECT q.id AS quiz_id,
       COALESCE(v.view_count, 0)::bigint AS view_count,
       COALESCE(a.attempted_count, 0)::bigint AS attempted_count
FROM public.quizzes AS q
LEFT JOIN (
  SELECT quiz_id, COUNT(*) AS view_count
  FROM public.quiz_views
  GROUP BY quiz_id
) AS v ON v.quiz_id = q.id
LEFT JOIN (
  SELECT quiz_id,
         COUNT(DISTINCT COALESCE(NULLIF(device_id,''), id::text)) AS attempted_count
  FROM public.attempts
  WHERE status = 'submitted'
  GROUP BY quiz_id
) AS a ON a.quiz_id = q.id;

-- Access to the detailed views and their summary stays server-only.
ALTER TABLE public.quiz_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.quiz_views FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.quiz_engagement_stats FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT ON TABLE public.quiz_views TO service_role;
GRANT SELECT ON TABLE public.quiz_engagement_stats TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- Quick verification:
-- SELECT * FROM public.quiz_engagement_stats ORDER BY view_count DESC LIMIT 10;
