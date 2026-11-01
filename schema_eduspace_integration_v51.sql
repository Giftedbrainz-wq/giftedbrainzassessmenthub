-- Gifted Brainz Assessment Hub v51 — opt-in EduSpace integration.
-- Apply to the SAME Supabase database as schema.sql using SQL Editor.
-- Never expose service_role/Secret keys or the integration HMAC secret to browsers.
create table if not exists public.eduspace_hub_links (
 id uuid primary key default gen_random_uuid(),
 device_id text not null,
 external_user_id uuid not null unique,
 credential_hash text not null unique,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 check(char_length(credential_hash)=64)
);
create unique index if not exists eduspace_hub_links_active_device on public.eduspace_hub_links(device_id) where active;
create index if not exists eduspace_hub_links_device_idx on public.eduspace_hub_links(device_id);
alter table public.eduspace_hub_links enable row level security;
revoke all on public.eduspace_hub_links from anon, authenticated;

create table if not exists public.eduspace_hub_outbox (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null unique,
 event_type text not null check (event_type in ('cbt.completed','question.bookmarked','question.unbookmarked')),
 source_id text,
 external_user_id uuid not null,
 payload jsonb not null,
 status text not null default 'pending' check (status in ('pending','delivered')),
 retry_count integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 last_error text,
 delivered_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index if not exists eduspace_hub_once_per_completed_attempt
 on public.eduspace_hub_outbox(external_user_id,source_id)
 where event_type='cbt.completed';
create index if not exists eduspace_hub_pending_idx on public.eduspace_hub_outbox(status,next_attempt_at);
alter table public.eduspace_hub_outbox enable row level security;
revoke all on public.eduspace_hub_outbox from anon, authenticated;
