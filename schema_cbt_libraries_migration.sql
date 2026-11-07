create table if not exists public.cbt_libraries (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cbt_libraries_slug_idx on public.cbt_libraries(slug);

create table if not exists public.cbt_library_items (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.cbt_libraries(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique(library_id, quiz_id)
);

create index if not exists cbt_library_items_library_idx on public.cbt_library_items(library_id, position, created_at);
create index if not exists cbt_library_items_quiz_idx on public.cbt_library_items(quiz_id);

-- Protect library tables from direct client access. The application uses the server-side service role.
alter table public.cbt_libraries enable row level security;
alter table public.cbt_library_items enable row level security;




-- Add private-library access controls and device-bound activation records.
-- This block mirrors schema_private_cbt_libraries_migration.sql for installs that
-- prefer to use the original library migration file.
alter table public.cbt_libraries add column if not exists access_mode text not null default 'public';
update public.cbt_libraries set access_mode='public' where access_mode is null or access_mode not in ('public','private');
alter table public.cbt_libraries alter column access_mode set default 'public', alter column access_mode set not null;
do $$ begin if not exists (select 1 from pg_constraint where conname='cbt_libraries_access_mode_check' and conrelid='public.cbt_libraries'::regclass) then alter table public.cbt_libraries add constraint cbt_libraries_access_mode_check check (access_mode in ('public','private')); end if; end $$;
create table if not exists public.cbt_library_device_access (id uuid primary key default gen_random_uuid(), library_id uuid not null references public.cbt_libraries(id) on delete cascade, device_id text not null, activation_code_hash text, activation_expires_at timestamptz, is_active boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), activated_at timestamptz, constraint cbt_library_device_access_unique unique (library_id, device_id), constraint cbt_library_device_access_device_length check (char_length(device_id) between 8 and 200));
create index if not exists cbt_library_device_access_lookup_idx on public.cbt_library_device_access(library_id,device_id,is_active);
alter table public.cbt_library_device_access enable row level security;
revoke all on table public.cbt_library_device_access from anon, authenticated;
