-- Gifted Brainz Assessment Hub v50.2.0 — independent Brainz Biltz quizzes.
-- Apply to the existing Supabase database before deploying the updated code.
-- Does NOT delete or alter existing CBTs, Question Pools or Brainz Biltz challenges.
create extension if not exists pgcrypto;

create table if not exists public.brain_boost_quizzes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft','published')),
  seconds_per_question integer not null default 30 check (seconds_per_question between 10 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.brain_boost_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.brain_boost_quizzes(id) on delete cascade,
  position integer not null default 0,
  prompt text not null,
  options jsonb not null check (jsonb_typeof(options)='array' and jsonb_array_length(options)=4),
  correct_index smallint not null check (correct_index between 0 and 3),
  explanation text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists brain_boost_questions_quiz_order on public.brain_boost_questions(quiz_id,position,id);
create table if not exists public.brain_boost_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.brain_boost_quizzes(id) on delete cascade,
  device_id text not null,
  student_name text not null,
  attempt_token_hash text not null,
  question_ids jsonb not null default '[]'::jsonb,
  question_snapshot jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  score integer,
  total integer,
  percent integer,
  status text not null default 'active' check (status in ('active','completed'))
);
create index if not exists brain_boost_attempts_quiz_started on public.brain_boost_attempts(quiz_id, started_at desc);

alter table public.brain_boost_quizzes enable row level security;
alter table public.brain_boost_questions enable row level security;
alter table public.brain_boost_attempts enable row level security;
revoke all on table public.brain_boost_quizzes from anon, authenticated;
revoke all on table public.brain_boost_questions from anon, authenticated;
revoke all on table public.brain_boost_attempts from anon, authenticated;
-- The EdgeOne API server accesses these tables using SUPABASE_SECRET_KEY only.
