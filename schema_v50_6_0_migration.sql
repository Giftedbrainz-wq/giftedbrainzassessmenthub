-- Gifted Brainz Assessment Hub v50.6.0 - run BEFORE deploying the code.
-- Additive only: preserves existing CBTs, Question Pools, quizzes, results and Biltz data.
ALTER TABLE public.brain_boost_quizzes ADD COLUMN IF NOT EXISTS start_at timestamptz;
ALTER TABLE public.brain_boost_quizzes ADD COLUMN IF NOT EXISTS end_at timestamptz;
ALTER TABLE public.brain_boost_quizzes ADD COLUMN IF NOT EXISTS registration_fields jsonb NOT NULL DEFAULT '[{"key":"full_name","label":"Full Name","type":"text","required":true}]'::jsonb;
CREATE TABLE IF NOT EXISTS public.brain_boost_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.brain_boost_quizzes(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  student_name text NOT NULL,
  student_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  registered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, device_id)
);
CREATE INDEX IF NOT EXISTS brain_boost_registrations_quiz_idx ON public.brain_boost_registrations(quiz_id,registered_at DESC);
ALTER TABLE public.brain_boost_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.brain_boost_registrations FROM anon,authenticated;
-- All reads and writes use the trusted EdgeOne service role.
