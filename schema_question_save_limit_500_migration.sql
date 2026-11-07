-- Gifted Brainz Assessment Hub — raise atomic question-save limit from 200 to 500.
-- Run this in Supabase SQL Editor before deploying a build that permits 500-question batches.

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

