-- Gifted Brainz Assessment Hub v51.5.0 — Study Mode AI usage quota.
-- Run ONCE in the Assessment Hub's existing Supabase project before deploying
-- v51.5.0. Idempotent, additive, and does not touch student or quiz records.
-- All AI requests pass through the server-side route and service-role RPC.
create table if not exists public.gb_study_ai_usage (
  identity_hash text not null,
  bucket_kind text not null check (bucket_kind in ('minute','hour','day')),
  bucket_start timestamptz not null,
  request_count integer not null default 1 check (request_count>=0),
  updated_at timestamptz not null default now(),
  primary key(identity_hash,bucket_kind,bucket_start)
);
create index if not exists gb_study_ai_usage_gc_idx on public.gb_study_ai_usage(bucket_start);
alter table public.gb_study_ai_usage enable row level security;
revoke all on public.gb_study_ai_usage from public, anon, authenticated;

create or replace function public.gb_study_ai_reserve_v1(p_identity text,p_bucket text,p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  moment timestamptz;
  allowed boolean;
begin
  if p_identity !~ '^(dev|ip):[a-f0-9]{64}$'
     or p_bucket not in ('minute','hour','day')
     or p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'Invalid AI quota request';
  end if;
  moment := date_trunc(p_bucket, now() at time zone 'UTC') at time zone 'UTC';
  insert into public.gb_study_ai_usage(identity_hash,bucket_kind,bucket_start,request_count,updated_at)
  values(p_identity,p_bucket,moment,1,now())
  on conflict(identity_hash,bucket_kind,bucket_start)
    do update set request_count=public.gb_study_ai_usage.request_count+1,updated_at=now()
    where public.gb_study_ai_usage.request_count < p_limit
  returning true into allowed;
  return coalesce(allowed,false);
end;
$$;
revoke all on function public.gb_study_ai_reserve_v1(text,text,integer) from public,anon,authenticated;
grant execute on function public.gb_study_ai_reserve_v1(text,text,integer) to service_role;

-- Optional periodic cleanup (manually or via a privileged scheduler):
-- DELETE FROM public.gb_study_ai_usage WHERE bucket_start < now()-interval '3 days';
