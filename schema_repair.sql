-- Gifted Brainz Assessment Hub — targeted production repair
-- Safe for an existing deployment. It does not delete quizzes, questions or attempts.
-- Run this in Supabase SQL Editor before/alongside deploying the matching EdgeOne build.

create extension if not exists pgcrypto;

-- CBT Libraries (additive, data-preserving). This is also available as the
-- standalone schema_cbt_libraries_migration.sql migration file.
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



-- Core schema compatibility (additive and data-preserving). Keep this repair
-- usable for existing deployments that predate newer API fields.
alter table public.quizzes add column if not exists description text not null default '';
alter table public.quizzes add column if not exists instructions text not null default '';
alter table public.quizzes add column if not exists student_fields jsonb not null default '[{"key":"full_name","label":"Full Name","type":"text","required":true,"leaderboard":true}]'::jsonb;
alter table public.quiz_sections add column if not exists marks numeric(10,4);
alter table public.passages alter column quiz_id drop not null;
alter table public.questions add column if not exists section_id uuid references public.quiz_sections(id) on delete set null;
alter table public.questions add column if not exists passage_id uuid references public.passages(id) on delete set null;
alter table public.questions add column if not exists type text not null default 'multiple_choice';
alter table public.questions add column if not exists position integer not null default 0;
alter table public.questions add column if not exists marks numeric not null default 1;
alter table public.questions add column if not exists image_data text;
alter table public.questions add column if not exists source_page integer;
alter table public.questions add column if not exists needs_review boolean not null default false;
alter table public.questions alter column marks type numeric using marks::numeric;
alter table public.attempts add column if not exists device_id text;
alter table public.attempts add column if not exists student_data jsonb not null default '{}'::jsonb;
alter table public.attempts add column if not exists status text not null default 'submitted';
alter table public.attempts add column if not exists result_token text;
alter table public.attempts add column if not exists result_released boolean not null default false;
alter table public.attempts alter column score type numeric using score::numeric;
alter table public.attempts alter column total type numeric using total::numeric;
alter table public.attempt_answers add column if not exists marks numeric(10,4) not null default 0;

-- Keep application data behind the server-side API; service_role remains able
-- to access these tables while anonymous direct PostgREST access is blocked.
alter table public.quizzes enable row level security;
alter table public.quiz_sections enable row level security;
alter table public.passages enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;


-- 1) Add result_slug if an older deployment does not have it.
alter table public.quizzes add column if not exists result_slug text;
alter table public.quizzes add column if not exists result_released boolean not null default false;

-- 2) Repair missing/duplicate result slugs before enforcing uniqueness.
do $$
declare
  r record;
  candidate text;
begin
  for r in
    select id
    from public.quizzes
    where result_slug is null
       or result_slug in (
         select result_slug
         from public.quizzes
         where result_slug is not null
         group by result_slug
         having count(*) > 1
       )
  loop
    loop
      candidate := lower(substr(encode(gen_random_bytes(8), 'hex'), 1, 10));
      exit when not exists (
        select 1 from public.quizzes q
        where q.result_slug = candidate and q.id <> r.id
      );
    end loop;
    update public.quizzes set result_slug = candidate where id = r.id;
  end loop;
end;
$$;

create unique index if not exists quizzes_result_slug_idx
  on public.quizzes(result_slug)
  where result_slug is not null;

-- 3) Remove the obsolete AI-save RPC that the current API no longer uses.
-- The old schema tried to REVOKE/GRANT this function even when it did not exist;
-- that made a clean schema run fail with "function ... does not exist".
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'save_questions_batch_atomic_v2'
  loop
    execute 'drop function if exists ' || r.signature || ' cascade';
  end loop;
end;
$$;

-- Remove obsolete overloads left by earlier versions.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'save_questions_batch_atomic'
  loop
    execute 'drop function if exists ' || r.signature || ' cascade';
  end loop;
end;
$$;



-- Student feedback / complaints migration for existing deployments.
create table if not exists public.student_feedback (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  attempt_id uuid references public.attempts(id) on delete set null,
  student_name text not null default 'Student',
  category text not null check (category in ('general','question_issue','technical','timing','accessibility','complaint','suggestion')),
  message text not null check (char_length(message) between 8 and 1800),
  contact text not null default '',
  status text not null default 'new' check (status in ('new','reviewed','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists student_feedback_quiz_created_idx on public.student_feedback(quiz_id, created_at desc);
create index if not exists student_feedback_status_created_idx on public.student_feedback(status, created_at desc);
alter table public.student_feedback enable row level security;

-- 4) Attempt number must exist before any attempt index references it.
alter table public.attempts add column if not exists attempt_no integer;

-- Support leaderboard-removal tombstones without allowing removed attempts to be submitted again.
update public.attempts set status='submitted' where status is null or status not in ('started','submitted','removed');
alter table public.attempts drop constraint if exists attempts_status_check;
alter table public.attempts add constraint attempts_status_check check (status in ('started','submitted','removed'));

-- Normalize all device-scoped attempt numbers chronologically before enforcing
-- uniqueness. This preserves the first/second/third attempt meaning consistently.
with numbered as (
  select id, row_number() over (partition by quiz_id, device_id order by started_at nulls first, submitted_at, id) as rn
  from public.attempts
  where device_id is not null
)
update public.attempts a
set attempt_no = numbered.rn
from numbered
where a.id = numbered.id;

update public.attempts
set attempt_no = 1
where attempt_no is null or attempt_no < 1;

-- Enforce one deterministic attempt number per CBT/device so the attempt limit cannot be bypassed by concurrent starts.
create unique index if not exists attempts_quiz_device_attempt_no_idx
  on public.attempts(quiz_id, device_id, attempt_no);

-- 5) Indexes matching the actual dashboard/PostgREST filters and sort orders.
create index if not exists quizzes_created_at_idx
  on public.quizzes(created_at desc);
create index if not exists quiz_sections_quiz_position_idx
  on public.quiz_sections(quiz_id, position asc, created_at asc);
create index if not exists passages_quiz_created_at_idx
  on public.passages(quiz_id, created_at asc);
create index if not exists questions_quiz_position_idx
  on public.questions(quiz_id, position asc, created_at asc);
create index if not exists questions_bank_created_at_idx
  on public.questions(created_at desc)
  where quiz_id is null;
create index if not exists attempts_status_submitted_at_idx
  on public.attempts(status, submitted_at desc);
create index if not exists attempts_quiz_status_device_idx
  on public.attempts(quiz_id, status, device_id, attempt_no);
create index if not exists attempts_result_lookup_idx
  on public.attempts(quiz_id, device_id, attempt_no, status, submitted_at asc);
create index if not exists attempts_leaderboard_idx
  on public.attempts(quiz_id, attempt_no, percent desc, time_used asc, submitted_at asc, id asc)
  where status = 'submitted' and device_id is not null;
alter table public.attempt_answers add column if not exists marks numeric(10,4) not null default 0;

create index if not exists attempt_answers_attempt_question_idx
  on public.attempt_answers(attempt_id, question_id);

-- Install every current API RPC that an existing deployment may be missing.
-- These functions are idempotent and data-preserving.
create or replace function public.delete_quiz_questions_bulk(p_quiz_id uuid, p_question_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_ids uuid[];
  passage_ids uuid[];
  removed_count integer := 0;
begin
  if p_quiz_id is null then
    raise exception 'Quiz id is required';
  end if;

  select coalesce(array_agg(q.id), '{}'), coalesce(array_agg(distinct q.passage_id) filter (where q.passage_id is not null), '{}')
    into deleted_ids, passage_ids
  from public.questions q
  where q.quiz_id = p_quiz_id
    and q.id = any(coalesce(p_question_ids, '{}'));

  if coalesce(array_length(deleted_ids, 1), 0) > 0 then
    delete from public.questions
    where quiz_id = p_quiz_id
      and id = any(deleted_ids);
    get diagnostics removed_count = row_count;
  end if;

  if coalesce(array_length(passage_ids, 1), 0) > 0 then
    delete from public.passages p
    where p.id = any(passage_ids)
      and not exists (select 1 from public.questions q where q.passage_id = p.id);
  end if;

  return jsonb_build_object(
    'removed', removed_count,
    'deleted_ids', to_jsonb(coalesce(deleted_ids, '{}'))
  );
end;
$$;

create or replace function public.delete_question_bank_bulk(p_question_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_ids uuid[];
  passage_ids uuid[];
  removed_count integer := 0;
begin
  select coalesce(array_agg(q.id), '{}'), coalesce(array_agg(distinct q.passage_id) filter (where q.passage_id is not null), '{}')
    into deleted_ids, passage_ids
  from public.questions q
  where q.quiz_id is null
    and q.id = any(coalesce(p_question_ids, '{}'));

  if coalesce(array_length(deleted_ids, 1), 0) > 0 then
    delete from public.questions
    where quiz_id is null
      and id = any(deleted_ids);
    get diagnostics removed_count = row_count;
  end if;

  if coalesce(array_length(passage_ids, 1), 0) > 0 then
    delete from public.passages p
    where p.id = any(passage_ids)
      and not exists (select 1 from public.questions q where q.passage_id = p.id);
  end if;

  return jsonb_build_object(
    'removed', removed_count,
    'deleted_ids', to_jsonb(coalesce(deleted_ids, '{}'))
  );
end;
$$;

create or replace function public.gb_save_ai_questions_v3(
  p_quiz_id uuid,
  p_section_id uuid,
  p_questions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  passage_item jsonb;
  passage_id uuid;
  new_id uuid;
  inserted_ids uuid[] := '{}';
  inserted_count integer := 0;
  passage_cache jsonb := '{}'::jsonb;
  cache_key text;
  source_page_text text;
  position_text text;
  marks_text text;
begin
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'No questions supplied';
  end if;
  if jsonb_array_length(p_questions) > 500 then
    raise exception 'A maximum of 500 questions can be saved at once';
  end if;
  if p_quiz_id is not null and p_section_id is null then
    raise exception 'Every question in a CBT must belong to a section';
  end if;
  if p_quiz_id is not null and not exists (select 1 from public.quizzes where id = p_quiz_id) then
    raise exception 'CBT not found';
  end if;
  if p_section_id is not null and not exists (select 1 from public.quiz_sections where id = p_section_id and quiz_id = p_quiz_id) then
    raise exception 'Selected section does not belong to this CBT';
  end if;

  for item in select value from jsonb_array_elements(p_questions) loop
    -- item is explicitly JSONB; never apply ->> to a TEXT variable.
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Every question must be a JSON object';
    end if;
    if nullif(trim(item->>'text'), '') is null then
      raise exception 'Question text is required';
    end if;
    if jsonb_typeof(item->'options') <> 'array' or jsonb_array_length(item->'options') <> 4 then
      raise exception 'Every question must contain exactly four options';
    end if;
    if exists (select 1 from jsonb_array_elements_text(item->'options') v where nullif(trim(v), '') is null) then
      raise exception 'Every option must be non-empty';
    end if;
    if not (item ? 'answer') or jsonb_typeof(item->'answer') <> 'number' or (item->>'answer')::int < 0 or (item->>'answer')::int > 3 then
      raise exception 'Every question must have a valid correct answer';
    end if;

    passage_id := null;
    passage_item := item->'passage';
    if jsonb_typeof(passage_item) = 'object' and nullif(trim(passage_item->>'content'), '') is not null then
      cache_key := md5(
        coalesce(passage_item->>'title','Passage') || E'\n' || coalesce(passage_item->>'content','')
      );
      if passage_cache ? cache_key then
        passage_id := (passage_cache->>cache_key)::uuid;
      else
        insert into public.passages (quiz_id, title, content)
        values (
          p_quiz_id,
          coalesce(nullif(trim(passage_item->>'title'), ''), 'Passage'),
          passage_item->>'content'
        )
        returning id into passage_id;
        passage_cache := passage_cache || jsonb_build_object(cache_key, passage_id::text);
      end if;
    elsif item->>'type' = 'passage' then
      raise exception 'A passage question requires passage content';
    end if;

    source_page_text := item->>'source_page';
    position_text := item->>'position';
    marks_text := item->>'marks';

    insert into public.questions (
      quiz_id, section_id, passage_id, type, text, options, answer, explanation,
      subject, topic, difficulty, marks, image_data, source_page, needs_review, position
    ) values (
      p_quiz_id,
      p_section_id,
      passage_id,
      case when item->>'type' = 'passage' then 'passage' else 'multiple_choice' end,
      item->>'text',
      item->'options',
      (item->>'answer')::int,
      coalesce(item->>'explanation',''),
      coalesce(item->>'subject','General'),
      coalesce(item->>'topic','General'),
      coalesce(item->>'difficulty','Medium'),
      greatest(coalesce(nullif(marks_text,'')::numeric, 1), 0.01),
      case
        when nullif(item->>'image_data','') is not null
         and length(item->>'image_data') <= 1200000
         and (item->>'image_data' ~ '^data:image/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=[:space:]]+$' or item->>'image_data' ~* '^https://')
          then item->>'image_data'
        else null
      end,
      case when source_page_text ~ '^\d+$' then source_page_text::int else null end,
      false,
      greatest(coalesce(nullif(position_text,'')::int, 0), 0)
    ) returning id into new_id;

    inserted_ids := array_append(inserted_ids, new_id);
    inserted_count := inserted_count + 1;
  end loop;

  return jsonb_build_object('inserted', inserted_count, 'ids', to_jsonb(inserted_ids));
end;
$$;

revoke all on function public.delete_quiz_questions_bulk(uuid, uuid[]) from public;
revoke all on function public.delete_question_bank_bulk(uuid[]) from public;
grant execute on function public.delete_quiz_questions_bulk(uuid, uuid[]) to service_role;
grant execute on function public.delete_question_bank_bulk(uuid[]) to service_role;
revoke all on function public.gb_save_ai_questions_v3(uuid, uuid, jsonb) from public;
grant execute on function public.gb_save_ai_questions_v3(uuid, uuid, jsonb) to service_role;

-- Atomic CBT submission. The API calculates the score server-side and sends the
-- answer rows here so the attempt status and answer records commit as one unit.
-- This prevents a partial submission where the attempt becomes submitted but the
-- answer insert fails (for example because the gateway/database briefly errors).
create or replace function public.submit_attempt_atomic(
  p_attempt_id uuid,
  p_quiz_id uuid,
  p_score numeric,
  p_total numeric,
  p_percent integer,
  p_pass_mark integer,
  p_time_used integer,
  p_auto_submitted boolean,
  p_violations integer,
  p_answer_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_attempt public.attempts%rowtype;
  item jsonb;
  qid uuid;
  selected integer;
  row_count integer := 0;
  answer_count integer := 0;
  seen_qids uuid[] := '{}';
begin
  if p_attempt_id is null or p_quiz_id is null then
    raise exception 'Attempt and CBT identifiers are required';
  end if;
  if p_score is null or p_total is null or p_total <= 0 then
    raise exception 'Invalid score totals';
  end if;
  if p_score < 0 or p_score > p_total + 0.0001 then
    raise exception 'Score is outside the valid range';
  end if;
  if p_percent is null or p_percent < 0 or p_percent > 100 then
    raise exception 'Invalid percentage';
  end if;
  if p_pass_mark is null or p_pass_mark < 0 or p_pass_mark > 100 then
    raise exception 'Invalid pass mark';
  end if;
  if p_time_used is null or p_time_used < 0 then
    raise exception 'Invalid time used';
  end if;
  if p_violations is null or p_violations < 0 or p_violations > 100 then
    raise exception 'Invalid violation count';
  end if;
  if p_answer_rows is null or jsonb_typeof(p_answer_rows) <> 'array' then
    raise exception 'Answer rows must be a JSON array';
  end if;

  select * into current_attempt
  from public.attempts
  where id = p_attempt_id and quiz_id = p_quiz_id
  for update;

  if not found then
    raise exception 'Attempt not found';
  end if;
  if current_attempt.status = 'removed' then
    raise exception 'This attempt has been removed from the leaderboard';
  end if;
  if current_attempt.status = 'submitted' then
    -- Idempotent retry: if the client lost the response after a successful
    -- commit, repeating the same submission must return the already-finalized
    -- attempt rather than converting a successful submission into an error.
    return jsonb_build_object(
      'id', current_attempt.id,
      'student_name', current_attempt.student_name,
      'device_id', current_attempt.device_id,
      'attempt_no', current_attempt.attempt_no,
      'score', current_attempt.score,
      'total', current_attempt.total,
      'percent', current_attempt.percent,
      'pass_mark', current_attempt.pass_mark,
      'time_used', current_attempt.time_used,
      'auto_submitted', current_attempt.auto_submitted,
      'violations', current_attempt.violations,
      'status', current_attempt.status,
      'submitted_at', current_attempt.submitted_at
    );
  end if;

  for item in select value from jsonb_array_elements(p_answer_rows) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Every answer row must be an object';
    end if;
    qid := nullif(item->>'question_id','')::uuid;
    selected := case when nullif(item->>'selected_answer','') is null then null else (item->>'selected_answer')::integer end;
    if qid is null or not exists (select 1 from public.questions where id=qid and quiz_id=p_quiz_id) then
      raise exception 'One or more submitted answers do not belong to this CBT';
    end if;
    if qid = any(seen_qids) then
      raise exception 'Duplicate answer rows were supplied';
    end if;
    seen_qids := array_append(seen_qids, qid);
    if selected is not null and (selected < 0 or selected > 3) then
      raise exception 'One or more submitted answers are invalid';
    end if;
    answer_count := answer_count + 1;
  end loop;

  -- A forfeited CBT may contain zero answered questions. The attempt still
  -- has a valid quiz total and must be finalized with an empty answer set.
  -- Do not reject an all-unanswered submission merely because answer_count is 0.

  -- Replace any accidental pre-existing rows for this attempt before inserting
  -- the authoritative server-scored set.
  delete from public.attempt_answers where attempt_id = p_attempt_id;

  update public.attempts
  set score = p_score,
      total = p_total,
      percent = p_percent,
      pass_mark = p_pass_mark,
      time_used = p_time_used,
      auto_submitted = coalesce(p_auto_submitted, false),
      violations = p_violations,
      status = 'submitted',
      submitted_at = now()
  where id = p_attempt_id;
  get diagnostics row_count = row_count;

  if row_count <> 1 then
    raise exception 'Attempt could not be submitted';
  end if;

  insert into public.attempt_answers (attempt_id, question_id, selected_answer, is_correct, marks)
  select
    p_attempt_id,
    q.id,
    x.selected_answer,
    case when x.selected_answer is not null and x.selected_answer = q.answer then true else false end,
    coalesce(x.marks, 0)
  from jsonb_to_recordset(p_answer_rows) as x(question_id uuid, selected_answer integer, is_correct boolean, marks numeric)
  join public.questions q on q.id = x.question_id and q.quiz_id = p_quiz_id;

  return jsonb_build_object(
    'id', current_attempt.id,
    'student_name', current_attempt.student_name,
    'device_id', current_attempt.device_id,
    'attempt_no', current_attempt.attempt_no,
    'score', p_score,
    'total', p_total,
    'percent', p_percent,
    'pass_mark', p_pass_mark,
    'time_used', p_time_used,
    'auto_submitted', coalesce(p_auto_submitted, false),
    'violations', p_violations,
    'status', 'submitted',
    'submitted_at', now()
  );
end;
$$;

revoke all on function public.submit_attempt_atomic(uuid, uuid, numeric, numeric, integer, integer, integer, boolean, integer, jsonb) from public;
grant execute on function public.submit_attempt_atomic(uuid, uuid, numeric, numeric, integer, integer, integer, boolean, integer, jsonb) to service_role;

-- Clear completed leaderboard results without terminating an in-progress attempt.
-- The frontend labels this action "Clear leaderboard", so only submitted rows
-- are removed; a live started CBT remains intact.
create or replace function public.clear_quiz_attempts_atomic(p_quiz_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_count integer := 0;
begin
  if p_quiz_id is null then raise exception 'Quiz id is required'; end if;
  if not exists (select 1 from public.quizzes where id = p_quiz_id) then raise exception 'CBT not found'; end if;

  delete from public.attempts
  where quiz_id = p_quiz_id
    and status = 'submitted';
  get diagnostics removed_count = row_count;

  update public.quizzes set result_released = false where id = p_quiz_id;
  return jsonb_build_object('removed', removed_count);
end;
$$;

revoke all on function public.clear_quiz_attempts_atomic(uuid) from public;
grant execute on function public.clear_quiz_attempts_atomic(uuid) to service_role;

-- 7) Planner statistics.
analyze public.quizzes;
analyze public.quiz_sections;
analyze public.passages;
analyze public.questions;
analyze public.attempts;
analyze public.attempt_answers;

-- Gifted Brainz v20 feature migration: section mark allocations + CBT duplication.
alter table public.quiz_sections add column if not exists marks numeric(10,2);

create or replace function public.clone_quiz_cascade(p_quiz_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  src public.quizzes%rowtype;
  new_quiz_id uuid := gen_random_uuid();
  new_title text;
  new_slug text := 'cbt-' || substr(replace(gen_random_uuid()::text,'-',''),1,16);
  new_result_slug text := 'result-' || substr(replace(gen_random_uuid()::text,'-',''),1,16);
  sec record;
  q record;
  p record;
  new_sec_id uuid;
  new_passage_id uuid;
  sec_map jsonb := '{}'::jsonb;
  passage_map jsonb := '{}'::jsonb;
begin
  select * into src from public.quizzes where id=p_quiz_id;
  if not found then raise exception 'CBT not found'; end if;

  new_title := coalesce(nullif(src.title,''),'CBT') || ' (Copy)';
  insert into public.quizzes(id,slug,result_slug,title,description,instructions,duration,pass_mark,status,settings,student_fields)
  values(new_quiz_id,new_slug,new_result_slug,new_title,src.description,src.instructions,src.duration,src.pass_mark,'draft',src.settings,src.student_fields);

  for sec in select * from public.quiz_sections where quiz_id=p_quiz_id order by position,created_at loop
    new_sec_id := gen_random_uuid();
    insert into public.quiz_sections(id,quiz_id,title,description,marks,position)
    values(new_sec_id,new_quiz_id,sec.title,sec.description,sec.marks,sec.position);
    sec_map := sec_map || jsonb_build_object(sec.id::text,new_sec_id::text);
  end loop;

  for p in select * from public.passages where quiz_id=p_quiz_id order by created_at loop
    new_passage_id := gen_random_uuid();
    insert into public.passages(id,quiz_id,title,content) values(new_passage_id,new_quiz_id,p.title,p.content);
    passage_map := passage_map || jsonb_build_object(p.id::text,new_passage_id::text);
  end loop;

  for q in select * from public.questions where quiz_id=p_quiz_id order by position,created_at loop
    insert into public.questions(id,quiz_id,section_id,passage_id,type,text,options,answer,explanation,subject,topic,difficulty,marks,image_data,source_page,needs_review,position)
    values(gen_random_uuid(),new_quiz_id,
      case when q.section_id is null then null else (sec_map->>q.section_id::text)::uuid end,
      case when q.passage_id is null then null else (passage_map->>q.passage_id::text)::uuid end,
      q.type,q.text,q.options,q.answer,q.explanation,q.subject,q.topic,q.difficulty,q.marks,q.image_data,q.source_page,q.needs_review,q.position);
  end loop;

  return jsonb_build_object('quiz_id',new_quiz_id);
end;
$$;
revoke all on function public.clone_quiz_cascade(uuid) from public;
grant execute on function public.clone_quiz_cascade(uuid) to service_role;

-- Admin-only deletion helper for removing a single submitted leaderboard entry.
-- The attempt row is retained as a tombstone so the device cannot regain a leaderboard
-- slot by creating a new attempt after an admin removes the previous entry.
create or replace function public.delete_attempt_cascade(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  qid uuid;
  current_status text;
begin
  select quiz_id, status into qid, current_status from public.attempts where id=p_attempt_id for update;
  if qid is null then raise exception 'Student attempt not found'; end if;
  if current_status <> 'removed' then
    delete from public.attempt_answers where attempt_id=p_attempt_id;
    update public.attempts
    set status='removed',
        student_name='Removed Student',
        student_data='{}'::jsonb
    where id=p_attempt_id;
  end if;
  return jsonb_build_object('ok',true,'quiz_id',qid,'status','removed');
end;
$$;
revoke all on function public.delete_attempt_cascade(uuid) from public;
grant execute on function public.delete_attempt_cascade(uuid) to service_role;
