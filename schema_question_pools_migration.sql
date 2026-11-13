-- Gifted Brainz Assessment Hub: Question Pools feature.
-- Run this migration in the Supabase SQL Editor before deploying the matching API/app build.
-- Data-preserving and safe to re-run (every statement is idempotent).
--
-- A Question Pool is an administrator-defined, named collection of Topics (e.g. Pool
-- "Chemistry" containing Topics "Separation Techniques", "Atomic Structure", ...).
-- Pool questions reuse the existing public.questions table (manual entry, AI generation
-- and document import already write to that table) via two new nullable columns,
-- pool_id and topic_id, so the existing question editor/AI studio/import pipeline and
-- image handling are reused rather than duplicated.
--
-- Public/private pool access reuses the same device-identification + activation-code
-- pattern already used for CBT Libraries (table cbt_library_device_access), via a
-- dedicated pool_device_access table.

create table if not exists public.question_pools (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null default '',
  access_mode text not null default 'public' check (access_mode in ('public', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists question_pools_slug_idx on public.question_pools(slug);

create table if not exists public.pool_topics (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.question_pools(id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pool_topics_unique_name unique (pool_id, name)
);
create index if not exists pool_topics_pool_idx on public.pool_topics(pool_id, position, created_at);

-- Reuse the existing question bank/editor/AI studio/import pipeline: a pool question is
-- simply a public.questions row with quiz_id/section_id left null and pool_id/topic_id set.
alter table public.questions add column if not exists pool_id uuid references public.question_pools(id) on delete set null;
alter table public.questions add column if not exists topic_id uuid references public.pool_topics(id) on delete set null;
create index if not exists questions_pool_idx on public.questions(pool_id);
create index if not exists questions_topic_idx on public.questions(topic_id);

create table if not exists public.pool_device_access (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.question_pools(id) on delete cascade,
  device_id text not null,
  activation_code_hash text,
  activation_expires_at timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  constraint pool_device_access_unique unique (pool_id, device_id),
  constraint pool_device_access_device_length check (char_length(device_id) between 8 and 200)
);
create index if not exists pool_device_access_lookup_idx on public.pool_device_access(pool_id, device_id, is_active);

-- Practice Mode: timed, scored, examination-style sessions over one or more topics.
create table if not exists public.pool_practice_attempts (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.question_pools(id) on delete cascade,
  device_id text not null,
  topic_ids jsonb not null default '[]'::jsonb,
  question_ids jsonb not null default '[]'::jsonb,
  duration integer not null default 20 check (duration > 0),
  student_name text not null default 'Student',
  score numeric not null default 0,
  total numeric not null default 0,
  percent integer not null default 0,
  time_used integer not null default 0,
  auto_submitted boolean not null default false,
  status text not null default 'started' check (status in ('started', 'submitted')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  result_token text
);
create index if not exists pool_practice_attempts_lookup_idx on public.pool_practice_attempts(pool_id, device_id, started_at desc);
create unique index if not exists pool_practice_attempts_result_token_idx on public.pool_practice_attempts(result_token) where result_token is not null;

create table if not exists public.pool_practice_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.pool_practice_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_answer integer,
  is_correct boolean not null default false
);
create index if not exists pool_practice_answers_attempt_idx on public.pool_practice_answers(attempt_id);

-- Study Mode: untimed, immediate per-question feedback, with resumable progress.
create table if not exists public.pool_study_progress (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.question_pools(id) on delete cascade,
  device_id text not null,
  topic_ids jsonb not null default '[]'::jsonb,
  question_ids jsonb not null default '[]'::jsonb,
  question_index integer not null default 0,
  answers jsonb not null default '{}'::jsonb,
  flags jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint pool_study_progress_unique unique (pool_id, device_id)
);

alter table public.question_pools enable row level security;
alter table public.pool_topics enable row level security;
alter table public.pool_device_access enable row level security;
alter table public.pool_practice_attempts enable row level security;
alter table public.pool_practice_answers enable row level security;
alter table public.pool_study_progress enable row level security;

-- No public client policies are added. The EdgeOne API accesses these tables with the
-- server-side Supabase Secret/Service Role key only, exactly like the CBT Library tables.
revoke all on table public.pool_device_access from anon, authenticated;
revoke all on table public.pool_practice_attempts from anon, authenticated;
revoke all on table public.pool_practice_answers from anon, authenticated;
revoke all on table public.pool_study_progress from anon, authenticated;
