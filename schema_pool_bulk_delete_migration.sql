-- Gifted Brainz Assessment Hub — Question Pool bulk-delete migration
-- Safe to run on an existing Supabase project.
--
-- Adds delete_pool_topic_questions_bulk, mirroring the existing
-- delete_quiz_questions_bulk used by the CBT Question Builder's "Delete
-- selected" action, so a Question Pool topic can bulk-delete the questions
-- an admin has checked, scoped to that topic only.

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

revoke all on function public.delete_pool_topic_questions_bulk(uuid, uuid[]) from public;
grant execute on function public.delete_pool_topic_questions_bulk(uuid, uuid[]) to service_role;
