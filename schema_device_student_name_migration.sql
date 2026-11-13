-- Gifted Brainz: record the student's name at device-activation time, so the
-- administrator's "Activated devices" list can show who each device belongs to.
-- Safe to re-run; data-preserving.

alter table public.cbt_library_device_access add column if not exists student_name text;
alter table public.pool_device_access add column if not exists student_name text;

-- Faster lookups for the admin "Activated devices" list (active devices per library/pool).
create index if not exists cbt_library_device_access_active_idx on public.cbt_library_device_access(library_id, is_active, activated_at desc);
create index if not exists pool_device_access_active_idx on public.pool_device_access(pool_id, is_active, activated_at desc);
