-- Gifted Brainz Assessment Hub: Question Pool progress, non-repeating practice cycling,
-- and recommendations. Run this after schema_question_pools_migration.sql (or schema.sql).
-- Idempotent and safe to re-run.

-- Tracks which "cycle" a device is currently on for a pool. A cycle is one full pass
-- through every (non-needs-review) question in the pool's selected topics; once a device
-- has seen every question in a topic in Practice Mode within the current cycle, the next
-- Practice session for that device bumps the cycle and starts a fresh pass.
create table if not exists public.pool_progress (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.question_pools(id) on delete cascade,
  device_id text not null,
  cycle integer not null default 1 check (cycle > 0),
  updated_at timestamptz not null default now(),
  constraint pool_progress_unique unique (pool_id, device_id)
);

-- Per-device, per-question exposure: lifetime times seen/correct (for long-run mastery),
-- plus the most recent cycle the question was answered in (used to compute "percent of
-- this topic solved in the current cycle" and to pick unseen questions for Practice Mode).
create table if not exists public.pool_question_exposure (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.question_pools(id) on delete cascade,
  topic_id uuid not null references public.pool_topics(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  device_id text not null,
  cycle integer not null default 1,
  times_seen integer not null default 0,
  times_correct integer not null default 0,
  last_mode text check (last_mode in ('study', 'practice')),
  last_answered_at timestamptz,
  constraint pool_question_exposure_unique unique (pool_id, question_id, device_id)
);
create index if not exists pool_question_exposure_lookup_idx on public.pool_question_exposure(pool_id, device_id, topic_id, cycle);

-- Practice attempts remember which cycle they were sampled against, so submission always
-- records exposure into the right cycle even if another session for the same device moved
-- the pool on to a new cycle in the meantime.
alter table public.pool_practice_attempts add column if not exists cycle integer not null default 1;

-- Atomic, incrementing exposure recorder. p_rows is a JSON array of
-- {pool_id, topic_id, question_id, device_id, cycle, is_correct, mode}. Called once per
-- answered question from both Study Mode (one row at a time) and Practice Mode (a batch
-- on submission), so times_seen/times_correct accumulate correctly under concurrent calls.
create or replace function public.gb_record_pool_exposure_v1(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  is_correct boolean;
  row_cycle integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return;
  end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    is_correct := coalesce((r->>'is_correct')::boolean, false);
    row_cycle := greatest(coalesce((r->>'cycle')::int, 1), 1);
    insert into public.pool_question_exposure (
      pool_id, topic_id, question_id, device_id, cycle, times_seen, times_correct, last_mode, last_answered_at
    ) values (
      (r->>'pool_id')::uuid,
      (r->>'topic_id')::uuid,
      (r->>'question_id')::uuid,
      r->>'device_id',
      row_cycle,
      1,
      case when is_correct then 1 else 0 end,
      r->>'mode',
      now()
    )
    on conflict (pool_id, question_id, device_id) do update set
      times_seen = public.pool_question_exposure.times_seen + 1,
      times_correct = public.pool_question_exposure.times_correct + (case when is_correct then 1 else 0 end),
      cycle = greatest(row_cycle, public.pool_question_exposure.cycle),
      last_mode = r->>'mode',
      last_answered_at = now();
  end loop;
end;
$$;

revoke all on function public.gb_record_pool_exposure_v1(jsonb) from public;
grant execute on function public.gb_record_pool_exposure_v1(jsonb) to service_role;

alter table public.pool_progress enable row level security;
alter table public.pool_question_exposure enable row level security;
revoke all on table public.pool_progress from anon, authenticated;
revoke all on table public.pool_question_exposure from anon, authenticated;
