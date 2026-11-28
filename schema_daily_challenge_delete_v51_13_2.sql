-- Gifted Brainz Assessment Hub v51.13.2 (RUN ONCE BEFORE DEPLOYMENT)
-- Enables genuine permanent deletion (not archiving) of Daily Challenges.
-- Deleting a challenge automatically deletes all associated submissions,
-- scores, feedback, and their private result links in the SAME transaction.
-- WARNING: irreversible. Back up records before deleting important work.
BEGIN;

ALTER TABLE public.daily_challenge_submissions
  DROP CONSTRAINT IF EXISTS daily_challenge_submissions_challenge_id_fkey;

ALTER TABLE public.daily_challenge_submissions
  ADD CONSTRAINT daily_challenge_submissions_challenge_id_fkey
  FOREIGN KEY (challenge_id)
  REFERENCES public.daily_challenges (id)
  ON DELETE CASCADE;

-- No direct student/anon access. Only server-side secret (service role)
-- may delete daily_challenges. The FK performs dependent row cleanup.
REVOKE DELETE ON public.daily_challenges FROM PUBLIC, anon, authenticated;
GRANT DELETE ON public.daily_challenges TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
