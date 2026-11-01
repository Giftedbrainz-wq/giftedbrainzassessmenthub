create extension if not exists pgcrypto;

-- CBT attempt limits are stored in quizzes.settings.maxAttempts; v14 uses null (or legacy 0/"unlimited") for unlimited attempts. No new column is required.
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  result_slug text,
  result_released boolean not null default false,
  title text not null,
  description text not null default '',
  instructions text not null default '',
  duration integer not null default 15 check (duration > 0),
  pass_mark integer not null default 50 check (pass_mark between 0 and 100),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  settings jsonb not null default '{}'::jsonb,
  student_fields jsonb not null default '[{"key":"full_name","label":"Full Name","type":"text","required":true,"leaderboard":true}]'::jsonb,
  access_mode text not null default 'public' check (access_mode in ('public','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade the original Gifted Brainz tables safely. This script is intended to be rerun.
alter table public.quizzes add column if not exists description text not null default '';
alter table public.quizzes add column if not exists instructions text not null default '';
alter table public.quizzes add column if not exists result_slug text;
alter table public.quizzes add column if not exists result_released boolean not null default false;
alter table public.quizzes add column if not exists access_mode text not null default 'public';
update public.quizzes set access_mode='public' where access_mode is null or access_mode not in ('public','private');
alter table public.quizzes alter column access_mode set default 'public', alter column access_mode set not null;
do $$ begin if not exists (select 1 from pg_constraint where conname='quizzes_access_mode_check' and conrelid='public.quizzes'::regclass) then alter table public.quizzes add constraint quizzes_access_mode_check check (access_mode in ('public','private')); end if; end $$;

-- Existing CBTs receive a short random result identifier when the schema is upgraded.
-- The collision-repair block also handles older deployments that may already
-- contain duplicate result_slug values before the unique index is created.
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
      exit when not exists (select 1 from public.quizzes q where q.result_slug = candidate and q.id <> r.id);
    end loop;
    update public.quizzes set result_slug = candidate where id = r.id;
  end loop;
end;
$$;

create unique index if not exists quizzes_result_slug_idx
  on public.quizzes(result_slug)
  where result_slug is not null;

alter table public.quizzes add column if not exists student_fields jsonb not null default '[{"key":"full_name","label":"Full Name","type":"text","required":true,"leaderboard":true}]'::jsonb;

create table if not exists public.cbt_libraries (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null default '',
  access_mode text not null default 'public' check (access_mode in ('public', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cbt_libraries add column if not exists access_mode text not null default 'public';
update public.cbt_libraries set access_mode='public' where access_mode is null or access_mode not in ('public','private');
alter table public.cbt_libraries alter column access_mode set default 'public', alter column access_mode set not null;
do $$ begin if not exists (select 1 from pg_constraint where conname='cbt_libraries_access_mode_check' and conrelid='public.cbt_libraries'::regclass) then alter table public.cbt_libraries add constraint cbt_libraries_access_mode_check check (access_mode in ('public','private')); end if; end $$;

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
  student_name text,
  constraint cbt_library_device_access_unique unique (library_id, device_id),
  constraint cbt_library_device_access_device_length check (char_length(device_id) between 8 and 200)
);
alter table public.cbt_library_device_access add column if not exists student_name text;
create index if not exists cbt_library_device_access_lookup_idx on public.cbt_library_device_access(library_id, device_id, is_active);

-- Individual private CBT access is separate from any CBT Library membership.
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

-- Editable platform settings are served only through the authenticated API.
create table if not exists public.app_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key,value) values ('administrator_whatsapp','2348156767275') on conflict (key) do nothing;

-- Protect private-access and configuration tables from direct client access.
alter table public.quiz_device_access enable row level security;
alter table public.app_settings enable row level security;
revoke all on table public.quiz_device_access from anon, authenticated;
revoke all on table public.app_settings from anon, authenticated;

-- Protect library tables from direct client access. The application uses the server-side service role.
alter table public.cbt_libraries enable row level security;
alter table public.cbt_library_items enable row level security;
alter table public.cbt_library_device_access enable row level security;
revoke all on table public.cbt_library_device_access from anon, authenticated;

create table if not exists public.quiz_sections (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  title text not null,
  description text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.passages (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid references public.quizzes(id) on delete cascade,
  title text not null default 'Passage',
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid references public.quizzes(id) on delete cascade,
  section_id uuid references public.quiz_sections(id) on delete set null,
  passage_id uuid references public.passages(id) on delete set null,
  type text not null default 'multiple_choice' check (type in ('multiple_choice','passage')),
  text text not null,
  options jsonb not null default '[]'::jsonb,
  answer integer not null default 0 check (answer >= 0 and answer < 4),
  explanation text not null default '',
  subject text not null default 'General',
  topic text not null default 'General',
  difficulty text not null default 'Medium',
  marks numeric not null default 1 check (marks > 0),
  image_data text,
  source_page integer,
  needs_review boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.questions add column if not exists section_id uuid references public.quiz_sections(id) on delete set null;
alter table public.questions add column if not exists passage_id uuid references public.passages(id) on delete set null;
alter table public.questions add column if not exists type text not null default 'multiple_choice';
alter table public.questions add column if not exists position integer not null default 0;
alter table public.questions add column if not exists marks numeric not null default 1;
alter table public.questions add column if not exists image_data text;
alter table public.questions add column if not exists source_page integer;
alter table public.questions add column if not exists needs_review boolean not null default false;
alter table public.passages alter column quiz_id drop not null;
alter table public.questions alter column marks type numeric using marks::numeric;

-- Keep legacy records valid.
update public.questions set type='multiple_choice' where type is null or type='';
update public.quizzes set description='' where description is null;
update public.quizzes set instructions='' where instructions is null;

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  device_id text,
  student_name text not null,
  student_data jsonb not null default '{}'::jsonb,
  score numeric not null,
  total numeric not null,
  percent integer not null,
  pass_mark integer not null,
  time_used integer not null default 0,
  auto_submitted boolean not null default false,
  violations integer not null default 0,
  started_at timestamptz,
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted' check (status in ('started','submitted','removed')),
  result_token text,
  result_released boolean not null default false,
  attempt_no integer
);

alter table public.attempts add column if not exists device_id text;
alter table public.attempts add column if not exists student_data jsonb not null default '{}'::jsonb;
alter table public.attempts add column if not exists status text not null default 'submitted';
update public.attempts set status='submitted' where status is null or status not in ('started','submitted','removed');
alter table public.attempts drop constraint if exists attempts_status_check;
alter table public.attempts add constraint attempts_status_check check (status in ('started','submitted','removed'));
alter table public.attempts alter column score type numeric using score::numeric;
alter table public.attempts alter column total type numeric using total::numeric;
alter table public.attempts add column if not exists result_token text;
alter table public.attempts add column if not exists result_released boolean not null default false;
create unique index if not exists attempts_result_token_idx on public.attempts(result_token) where result_token is not null;



-- Student complaints, technical issues and suggestions submitted after a mock test.
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

create table if not exists public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_answer integer,
  is_correct boolean not null default false,
  marks numeric(10,4) not null default 0
);

-- Normalize any legacy CBT questions that predate required section assignment.
-- The earliest section in each CBT becomes the destination for legacy null-section questions.
with first_sections as (
  select distinct on (quiz_id) quiz_id, id
  from public.quiz_sections
  order by quiz_id, position asc, created_at asc
)
update public.questions q
set section_id = fs.id
from first_sections fs
where q.quiz_id = fs.quiz_id
  and q.section_id is null;

create index if not exists quiz_sections_quiz_id_idx on public.quiz_sections(quiz_id);
create index if not exists passages_quiz_id_idx on public.passages(quiz_id);
create index if not exists questions_quiz_id_idx on public.questions(quiz_id);
create index if not exists questions_section_id_idx on public.questions(section_id);
create index if not exists attempts_quiz_id_idx on public.attempts(quiz_id);
create index if not exists attempts_quiz_device_idx on public.attempts(quiz_id, device_id);
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

-- Attempt limits are enforced per CBT and per device. Add this column before
-- creating any index that references it; older versions of this schema did the
-- index first, which could abort the migration with "column attempt_no does not exist".
alter table public.attempts add column if not exists attempt_no integer;

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

-- Normalize attempt numbers chronologically per CBT/device before enforcing uniqueness.
with numbered as (
  select id, row_number() over (partition by quiz_id, device_id order by started_at nulls first, submitted_at, id) as rn
  from public.attempts
  where device_id is not null
)
update public.attempts a set attempt_no = numbered.rn from numbered where a.id = numbered.id;

update public.attempts set attempt_no = 1 where attempt_no is null or attempt_no < 1;

create unique index if not exists attempts_quiz_device_attempt_no_idx
  on public.attempts(quiz_id, device_id, attempt_no)
  where device_id is not null;


-- Lock the database tables behind the EdgeOne API. The application uses the
-- Supabase Secret/service-role key server-side, which bypasses RLS. Enabling RLS
-- with no public policies prevents anonymous clients from reading answers,
-- attempts, student data, or administration records directly through PostgREST.
alter table public.quizzes enable row level security;
alter table public.quiz_sections enable row level security;
alter table public.passages enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;

-- Remove the legacy device-lock table. Maximum attempts now controls all attempt restrictions.
drop table if exists public.quiz_device_locks;

-- The unique attempt index is scoped to (quiz, device, attempt number); it prevents duplicate attempt numbers while still allowing unlimited numbered attempts.

-- Atomic bulk deletion helpers used by the Assessment Hub Question Builder.
-- Run this section against the existing Supabase project when deploying this build.
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

-- Bulk-delete for Question Pool topic questions (mirrors
-- delete_quiz_questions_bulk above, scoped to topic_id instead of quiz_id).
create or replace function public.delete_pool_topic_questions_bulk(p_topic_id uuid, p_question_ids uuid[])
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
  if p_topic_id is null then
    raise exception 'Topic id is required';
  end if;

  select coalesce(array_agg(q.id), '{}'), coalesce(array_agg(distinct q.passage_id) filter (where q.passage_id is not null), '{}')
    into deleted_ids, passage_ids
  from public.questions q
  where q.topic_id = p_topic_id
    and q.id = any(coalesce(p_question_ids, '{}'));

  if coalesce(array_length(deleted_ids, 1), 0) > 0 then
    delete from public.questions
    where topic_id = p_topic_id
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

revoke all on function public.delete_quiz_questions_bulk(uuid, uuid[]) from public;
revoke all on function public.delete_question_bank_bulk(uuid[]) from public;
revoke all on function public.delete_pool_topic_questions_bulk(uuid, uuid[]) from public;
grant execute on function public.delete_quiz_questions_bulk(uuid, uuid[]) to service_role;
grant execute on function public.delete_question_bank_bulk(uuid[]) to service_role;
grant execute on function public.delete_pool_topic_questions_bulk(uuid, uuid[]) to service_role;


-- AI BATCH SAVE MIGRATION
-- IMPORTANT: PostgreSQL permits overloaded functions to coexist. Previous
-- Gifted Brainz builds used several signatures for the AI batch-save RPC.
-- Some legacy versions accepted TEXT and attempted TEXT ->> 'text', which
-- causes: operator does not exist: text ->> unknown.
-- Remove EVERY function named save_questions_batch_atomic, regardless of its
-- old argument types, before installing the new uniquely named JSONB RPC.
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

drop function if exists public.gb_save_ai_questions_v3(uuid, uuid, text);
drop function if exists public.gb_save_ai_questions_v3(uuid, uuid, json);
drop function if exists public.gb_save_ai_questions_v3(uuid, uuid, jsonb);

-- Atomic AI question-batch saving. The payload is JSONB from the first line of
-- the function onward, so all ->> and -> operations below are type-safe.
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

revoke all on function public.gb_save_ai_questions_v3(uuid, uuid, jsonb) from public;
grant execute on function public.gb_save_ai_questions_v3(uuid, uuid, jsonb) to service_role;

-- Atomic bulk-insert for Question Pool questions (AI-generated/extracted or
-- draft content being saved into a pool topic). Mirrors gb_save_ai_questions_v3
-- above, but targets pool_id/topic_id instead of quiz_id/section_id, so a
-- whole batch (up to 500 questions) is saved in a single database round trip
-- instead of one request per question.
create or replace function public.gb_save_pool_questions_v1(
  p_pool_id uuid,
  p_topic_id uuid,
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
  if p_pool_id is null or p_topic_id is null then
    raise exception 'Every question in a Question Pool must belong to a topic';
  end if;
  if not exists (select 1 from public.question_pools where id = p_pool_id) then
    raise exception 'Question Pool not found';
  end if;
  if not exists (select 1 from public.pool_topics where id = p_topic_id and pool_id = p_pool_id) then
    raise exception 'Selected topic does not belong to this Question Pool';
  end if;

  for item in select value from jsonb_array_elements(p_questions) loop
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
          null,
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
      pool_id, topic_id, passage_id, type, text, options, answer, explanation,
      subject, topic, difficulty, marks, image_data, source_page, needs_review, position
    ) values (
      p_pool_id,
      p_topic_id,
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

revoke all on function public.gb_save_pool_questions_v1(uuid, uuid, jsonb) from public;
grant execute on function public.gb_save_pool_questions_v1(uuid, uuid, jsonb) to service_role;

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

-- When an admin corrects a question (fixes the marked correct answer, or
-- changes its mark value) after students have already submitted the CBT,
-- every affected attempt must be re-scored so the student's score, percent,
-- pass/fail status and leaderboard position are accurate. Unlike
-- submit_attempt_atomic (for a brand-new submission, and idempotent against
-- an already-submitted attempt), this function is specifically for revising
-- an attempt that is already submitted.
create or replace function public.regrade_attempt_atomic(
  p_attempt_id uuid,
  p_score numeric,
  p_total numeric,
  p_percent integer,
  p_answer_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_attempt public.attempts%rowtype;
  row_count integer := 0;
begin
  if p_attempt_id is null then
    raise exception 'Attempt identifier is required';
  end if;
  if p_score is null or p_total is null or p_total < 0 then
    raise exception 'Invalid score totals';
  end if;
  if p_score < 0 or p_score > p_total + 0.0001 then
    raise exception 'Score is outside the valid range';
  end if;
  if p_percent is null or p_percent < 0 or p_percent > 100 then
    raise exception 'Invalid percentage';
  end if;
  if p_answer_rows is null or jsonb_typeof(p_answer_rows) <> 'array' then
    raise exception 'Answer rows must be a JSON array';
  end if;

  select * into current_attempt
  from public.attempts
  where id = p_attempt_id
  for update;

  if not found then
    raise exception 'Attempt not found';
  end if;

  delete from public.attempt_answers where attempt_id = p_attempt_id;

  insert into public.attempt_answers (attempt_id, question_id, selected_answer, is_correct, marks)
  select
    p_attempt_id,
    x.question_id,
    x.selected_answer,
    coalesce(x.is_correct, false),
    coalesce(x.marks, 0)
  from jsonb_to_recordset(p_answer_rows) as x(question_id uuid, selected_answer integer, is_correct boolean, marks numeric);

  update public.attempts
  set score = p_score,
      total = p_total,
      percent = p_percent
  where id = p_attempt_id;
  get diagnostics row_count = row_count;

  if row_count <> 1 then
    raise exception 'Attempt could not be regraded';
  end if;

  return jsonb_build_object(
    'id', current_attempt.id,
    'score', p_score,
    'total', p_total,
    'percent', p_percent
  );
end;
$$;

revoke all on function public.regrade_attempt_atomic(uuid, numeric, numeric, integer, jsonb) from public;
grant execute on function public.regrade_attempt_atomic(uuid, numeric, numeric, integer, jsonb) to service_role;

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
  if not exists (select 1 from quizzes where id = p_quiz_id) then raise exception 'CBT not found'; end if;

  -- Clear completed results only. An in-progress started attempt must survive
  -- this administrator action so a live student is not disconnected mid-test.
  delete from attempts where quiz_id = p_quiz_id and status = 'submitted';
  get diagnostics removed_count = row_count;

  update quizzes set result_released = false where id = p_quiz_id;
  return jsonb_build_object('removed', removed_count);
end;
$$;



-- Guaranteed CBT deletion: remove every child record first, including attempts,
-- attempt answers, questions, passages and sections. This does not rely on the
-- existing foreign-key constraint names, so it also repairs older deployments.
create or replace function public.delete_quiz_cascade(p_quiz_id uuid)
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

  delete from public.attempt_answers aa
  where exists (select 1 from public.attempts a where a.id=aa.attempt_id and a.quiz_id=p_quiz_id);
  delete from public.attempts where quiz_id=p_quiz_id;
  delete from public.questions where quiz_id=p_quiz_id;
  delete from public.passages where quiz_id=p_quiz_id;
  delete from public.quiz_sections where quiz_id=p_quiz_id;
  delete from public.quizzes where id=p_quiz_id;
  get diagnostics removed_count = row_count;

  return jsonb_build_object('removed', removed_count);
end;
$$;

-- Older builds referenced a v2 AI-save RPC that no longer exists. Remove it
-- when present; never REVOKE/GRANT a function that has not been created.
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
revoke all on function public.clear_quiz_attempts_atomic(uuid) from public;
grant execute on function public.clear_quiz_attempts_atomic(uuid) to service_role;
grant execute on function public.delete_quiz_cascade(uuid) to service_role;

-- Refresh planner statistics after the migration so the new indexes are
-- considered immediately by the PostgREST queries used by the API.
analyze public.quizzes;
analyze public.quiz_sections;
analyze public.passages;
analyze public.questions;
analyze public.attempts;
analyze public.attempt_answers;
analyze public.cbt_libraries;
analyze public.cbt_library_items;

-- Gifted Brainz v20: section mark allocations.
alter table public.quiz_sections add column if not exists marks numeric(10,2);

-- Gifted Brainz v20: clone a CBT without cloning student submissions.
create or replace function public.clone_quiz_cascade(p_quiz_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare src public.quizzes%rowtype; new_quiz_id uuid:=gen_random_uuid(); new_title text; sec record; q record; p record; new_sec_id uuid; new_passage_id uuid; sec_map jsonb:='{}'::jsonb; passage_map jsonb:='{}'::jsonb;
begin
 select * into src from public.quizzes where id=p_quiz_id; if not found then raise exception 'CBT not found'; end if;
 new_title:=coalesce(nullif(src.title,''),'CBT')||' (Copy)';
 insert into public.quizzes(id,slug,result_slug,title,description,instructions,duration,pass_mark,status,settings,student_fields) values(new_quiz_id,'cbt-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),'result-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),new_title,src.description,src.instructions,src.duration,src.pass_mark,'draft',src.settings,src.student_fields);
 for sec in select * from public.quiz_sections where quiz_id=p_quiz_id order by position,created_at loop new_sec_id:=gen_random_uuid(); insert into public.quiz_sections(id,quiz_id,title,description,marks,position) values(new_sec_id,new_quiz_id,sec.title,sec.description,sec.marks,sec.position); sec_map:=sec_map||jsonb_build_object(sec.id::text,new_sec_id::text); end loop;
 for p in select * from public.passages where quiz_id=p_quiz_id order by created_at loop new_passage_id:=gen_random_uuid(); insert into public.passages(id,quiz_id,title,content) values(new_passage_id,new_quiz_id,p.title,p.content); passage_map:=passage_map||jsonb_build_object(p.id::text,new_passage_id::text); end loop;
 for q in select * from public.questions where quiz_id=p_quiz_id order by position,created_at loop insert into public.questions(id,quiz_id,section_id,passage_id,type,text,options,answer,explanation,subject,topic,difficulty,marks,image_data,source_page,needs_review,position) values(gen_random_uuid(),new_quiz_id,case when q.section_id is null then null else (sec_map->>q.section_id::text)::uuid end,case when q.passage_id is null then null else (passage_map->>q.passage_id::text)::uuid end,q.type,q.text,q.options,q.answer,q.explanation,q.subject,q.topic,q.difficulty,q.marks,q.image_data,q.source_page,q.needs_review,q.position); end loop;
 return jsonb_build_object('quiz_id',new_quiz_id);
end; $$;
revoke all on function public.clone_quiz_cascade(uuid) from public;
grant execute on function public.clone_quiz_cascade(uuid) to service_role;

create or replace function public.delete_attempt_cascade(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public as $$
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

-- ============================================================================
-- Question Pools (v47): administrator-managed pools of topics, reusing the
-- existing question bank/editor/AI studio/import pipeline. See
-- schema_question_pools_migration.sql for standalone notes; this block is
-- identical and kept in sync so a fresh database only needs to run this file.
-- ============================================================================

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
  student_name text,
  constraint pool_device_access_unique unique (pool_id, device_id),
  constraint pool_device_access_device_length check (char_length(device_id) between 8 and 200)
);
alter table public.pool_device_access add column if not exists student_name text;
create index if not exists pool_device_access_lookup_idx on public.pool_device_access(pool_id, device_id, is_active);

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
revoke all on table public.pool_device_access from anon, authenticated;
revoke all on table public.pool_practice_attempts from anon, authenticated;
revoke all on table public.pool_practice_answers from anon, authenticated;
revoke all on table public.pool_study_progress from anon, authenticated;

-- ============================================================================
-- Question Pool progress, cycling, and recommendations (v47.6). Identical to
-- schema_pool_progress_migration.sql; kept in sync so a fresh database only
-- needs this one file.
-- ============================================================================

create table if not exists public.pool_progress (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.question_pools(id) on delete cascade,
  device_id text not null,
  cycle integer not null default 1 check (cycle > 0),
  updated_at timestamptz not null default now(),
  constraint pool_progress_unique unique (pool_id, device_id)
);

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

alter table public.pool_practice_attempts add column if not exists cycle integer not null default 1;

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


-- Brainz Biltz scheduled, shareable challenges.
-- Brainz Biltz: shareable scheduled challenges with optional paid/private entry.
-- Safe to rerun on an existing Gifted Brainz installation.
create extension if not exists pgcrypto;

create table if not exists public.brainz_biltz_challenges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  quiz_id uuid not null references public.quizzes(id) on delete restrict,
  cover_image_url text not null default '',
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_minutes integer not null default 30 check (duration_minutes between 1 and 600),
  entry_fee numeric(12,2) not null default 0 check (entry_fee >= 0),
  access_mode text not null default 'public' check (access_mode in ('public','private')),
  status text not null default 'draft' check (status in ('draft','published','paused','cancelled','archived')),
  challenge_only boolean not null default true,
  attempt_limit integer not null default 1 check (attempt_limit between 1 and 100),
  max_participants integer check (max_participants is null or max_participants between 1 and 1000000),
  finish_policy text not null default 'full_duration' check (finish_policy in ('full_duration','finish_by_end')),
  leaderboard_enabled boolean not null default true,
  leaderboard_release text not null default 'after_end' check (leaderboard_release in ('immediate','after_end','manual')),
  review_enabled boolean not null default true,
  results_published boolean not null default false,
  payment_instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brainz_biltz_challenge_times check (end_at > start_at)
);

create index if not exists brainz_biltz_challenges_quiz_idx on public.brainz_biltz_challenges(quiz_id, status);
create index if not exists brainz_biltz_challenges_schedule_idx on public.brainz_biltz_challenges(status, start_at, end_at);

create table if not exists public.brainz_biltz_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.brainz_biltz_challenges(id) on delete cascade,
  device_id text not null,
  participant_name text not null,
  contact text not null default '',
  status text not null default 'pending_approval' check (status in ('pending_payment','pending_approval','approved','rejected','revoked')),
  payment_reference text not null default '',
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint brainz_biltz_participants_device_unique unique (challenge_id, device_id),
  constraint brainz_biltz_participants_device_length check (char_length(device_id) between 8 and 200),
  constraint brainz_biltz_participants_name_length check (char_length(participant_name) between 1 and 200)
);

create index if not exists brainz_biltz_participants_challenge_status_idx on public.brainz_biltz_participants(challenge_id, status, created_at);
create index if not exists brainz_biltz_participants_device_idx on public.brainz_biltz_participants(device_id, challenge_id);

create table if not exists public.brainz_biltz_attempts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.brainz_biltz_challenges(id) on delete cascade,
  participant_id uuid not null references public.brainz_biltz_participants(id) on delete cascade,
  attempt_id uuid not null unique references public.attempts(id) on delete cascade,
  device_id text not null,
  duration_minutes integer not null check (duration_minutes between 1 and 600),
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists brainz_biltz_attempts_challenge_idx on public.brainz_biltz_attempts(challenge_id, started_at);
create index if not exists brainz_biltz_attempts_participant_idx on public.brainz_biltz_attempts(challenge_id, participant_id);

-- All challenge administration and access decisions run through the server-side API.
alter table public.brainz_biltz_challenges enable row level security;
alter table public.brainz_biltz_participants enable row level security;
alter table public.brainz_biltz_attempts enable row level security;
revoke all on table public.brainz_biltz_challenges from anon, authenticated;
revoke all on table public.brainz_biltz_participants from anon, authenticated;
revoke all on table public.brainz_biltz_attempts from anon, authenticated;
