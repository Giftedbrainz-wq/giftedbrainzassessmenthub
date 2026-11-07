-- Gifted Brainz EduSpace: public/private CBT libraries and device-bound activation.
-- Run this migration in the Supabase SQL Editor before deploying the matching app/API.
-- Data-preserving and safe to re-run.

alter table public.cbt_libraries
  add column if not exists access_mode text not null default 'public';

-- Normalise any unexpected legacy values before adding the constraint.
update public.cbt_libraries
set access_mode = 'public'
where access_mode is null or access_mode not in ('public', 'private');

alter table public.cbt_libraries
  alter column access_mode set default 'public',
  alter column access_mode set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cbt_libraries_access_mode_check'
      and conrelid = 'public.cbt_libraries'::regclass
  ) then
    alter table public.cbt_libraries
      add constraint cbt_libraries_access_mode_check
      check (access_mode in ('public', 'private'));
  end if;
end $$;

create table if not exists public.cbt_library_device_access (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.cbt_libraries(id) on delete cascade,
  device_id text not null,
  activation_code_hash text,
  activation_expires_at timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  constraint cbt_library_device_access_unique unique (library_id, device_id),
  constraint cbt_library_device_access_device_length check (char_length(device_id) between 8 and 200)
);

create index if not exists cbt_library_device_access_lookup_idx
  on public.cbt_library_device_access(library_id, device_id, is_active);

alter table public.cbt_libraries enable row level security;
alter table public.cbt_library_items enable row level security;
alter table public.cbt_library_device_access enable row level security;

-- No public client policies are added. The EdgeOne API accesses these tables
-- with the server-side Supabase Secret/Service Role key only.
revoke all on table public.cbt_library_device_access from anon, authenticated;
