-- Gifted Brainz Assessment Hub — Private Quiz access and editable administrator contact.
-- Safe and additive for existing deployments. Run in Supabase SQL Editor before deploying the matching app/API.

create extension if not exists pgcrypto;

alter table public.quizzes add column if not exists access_mode text not null default 'public';
update public.quizzes set access_mode='public' where access_mode is null or access_mode not in ('public','private');
alter table public.quizzes alter column access_mode set default 'public', alter column access_mode set not null;
do $$ begin if not exists (select 1 from pg_constraint where conname='quizzes_access_mode_check' and conrelid='public.quizzes'::regclass) then alter table public.quizzes add constraint quizzes_access_mode_check check (access_mode in ('public','private')); end if; end $$;

create table if not exists public.quiz_device_access (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  device_id text not null,
  activation_code_hash text,
  activation_expires_at timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  student_name text,
  constraint quiz_device_access_unique unique (quiz_id, device_id),
  constraint quiz_device_access_device_length check (char_length(device_id) between 8 and 200)
);
create index if not exists quiz_device_access_lookup_idx on public.quiz_device_access(quiz_id, device_id, is_active);

create table if not exists public.app_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key,value) values ('administrator_whatsapp','2348156767275') on conflict (key) do nothing;

alter table public.quiz_device_access enable row level security;
alter table public.app_settings enable row level security;
revoke all on table public.quiz_device_access from anon, authenticated;
revoke all on table public.app_settings from anon, authenticated;
