-- Brainz Biltz: shareable scheduled challenges with optional paid/private entry.
-- Safe to rerun on an existing Gifted Brainz installation.
create extension if not exists pgcrypto;

create table if not exists public.brainz_biltz_challenges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  quiz_id uuid not null references public.quizzes(id) on delete restrict,
  cover_image_url text not null default '',
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_minutes integer not null default 30 check (duration_minutes between 1 and 600),
  entry_fee numeric(12,2) not null default 0 check (entry_fee >= 0),
  access_mode text not null default 'public' check (access_mode in ('public','private')),
  status text not null default 'draft' check (status in ('draft','published','paused','cancelled','archived')),
  challenge_only boolean not null default true,
  attempt_limit integer not null default 1 check (attempt_limit between 1 and 100),
  max_participants integer check (max_participants is null or max_participants between 1 and 1000000),
  finish_policy text not null default 'full_duration' check (finish_policy in ('full_duration','finish_by_end')),
  leaderboard_enabled boolean not null default true,
  leaderboard_release text not null default 'after_end' check (leaderboard_release in ('immediate','after_end','manual')),
  review_enabled boolean not null default true,
  results_published boolean not null default false,
  payment_instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brainz_biltz_challenge_times check (end_at > start_at)
);

create index if not exists brainz_biltz_challenges_quiz_idx on public.brainz_biltz_challenges(quiz_id, status);
create index if not exists brainz_biltz_challenges_schedule_idx on public.brainz_biltz_challenges(status, start_at, end_at);

create table if not exists public.brainz_biltz_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.brainz_biltz_challenges(id) on delete cascade,
  device_id text not null,
  participant_name text not null,
  contact text not null default '',
  status text not null default 'pending_approval' check (status in ('pending_payment','pending_approval','approved','rejected','revoked')),
  payment_reference text not null default '',
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint brainz_biltz_participants_device_unique unique (challenge_id, device_id),
  constraint brainz_biltz_participants_device_length check (char_length(device_id) between 8 and 200),
  constraint brainz_biltz_participants_name_length check (char_length(participant_name) between 1 and 200)
);

create index if not exists brainz_biltz_participants_challenge_status_idx on public.brainz_biltz_participants(challenge_id, status, created_at);
create index if not exists brainz_biltz_participants_device_idx on public.brainz_biltz_participants(device_id, challenge_id);

create table if not exists public.brainz_biltz_attempts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.brainz_biltz_challenges(id) on delete cascade,
  participant_id uuid not null references public.brainz_biltz_participants(id) on delete cascade,
  attempt_id uuid not null unique references public.attempts(id) on delete cascade,
  device_id text not null,
  duration_minutes integer not null check (duration_minutes between 1 and 600),
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists brainz_biltz_attempts_challenge_idx on public.brainz_biltz_attempts(challenge_id, started_at);
create index if not exists brainz_biltz_attempts_participant_idx on public.brainz_biltz_attempts(challenge_id, participant_id);

-- All challenge administration and access decisions run through the server-side API.
alter table public.brainz_biltz_challenges enable row level security;
alter table public.brainz_biltz_participants enable row level security;
alter table public.brainz_biltz_attempts enable row level security;
revoke all on table public.brainz_biltz_challenges from anon, authenticated;
revoke all on table public.brainz_biltz_participants from anon, authenticated;
revoke all on table public.brainz_biltz_attempts from anon, authenticated;
