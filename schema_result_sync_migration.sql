-- Gifted Brainz Assessment Hub v45 result + leaderboard reliability migration
-- Safe to run on an existing Supabase project.

alter table public.attempts
  add column if not exists result_token text;

-- Each submitted attempt gets a private, high-entropy result token.
-- Keep NULL legacy rows allowed; new rows will be populated by the API.
create unique index if not exists attempts_result_token_idx
  on public.attempts(result_token)
  where result_token is not null;

-- Backfill missing tokens for existing attempts so a student who already has a
-- submitted result can later receive a personal result link after the package is
-- updated. pgcrypto provides gen_random_bytes in standard Supabase projects.
update public.attempts
set result_token = encode(gen_random_bytes(24), 'hex')
where result_token is null;

