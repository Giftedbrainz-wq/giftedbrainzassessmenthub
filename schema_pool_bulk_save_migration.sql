-- Gifted Brainz Assessment Hub — Question Pool bulk-save migration
-- Safe to run on an existing Supabase project.
--
-- Problem: saving AI-generated/extracted questions into a Question Pool topic
-- previously inserted them one row at a time, in a loop, from the edge
-- function (up to 200 separate sequential HTTP requests to Supabase for one
-- "Save to Question Pool" click). That is slow and fragile — a single
-- transient hiccup on any one of those 200 requests (or simply running long
-- enough to hit a platform/gateway timeout) surfaces to the admin as
-- "Supabase questions request failed at supabase (HTTP 502)", and whatever
-- had already been inserted before the failure is left stranded.
--
-- Fix: a single atomic bulk-insert function, mirroring the existing
-- gb_save_ai_questions_v3 used for CBT questions, so an entire batch (up to
-- 500 questions) is saved in one database round trip, all-or-nothing.

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
