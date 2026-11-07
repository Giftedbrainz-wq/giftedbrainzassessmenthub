-- Gifted Brainz Assessment Hub result-correction migration
-- Safe to run on an existing Supabase project.
--
-- Purpose: when an admin corrects a question (fixes the marked correct
-- answer, or changes its mark value) after students have already submitted
-- the CBT, every affected attempt must be re-scored against the corrected
-- question so the student's score, percent, pass/fail status and leaderboard
-- position are accurate. This function performs that re-score atomically for
-- one attempt; the edge function calls it once per affected submitted
-- attempt right after a question-save that changes `answer` or `marks`.
--
-- Unlike submit_attempt_atomic (which is for a brand-new submission and is
-- idempotent/refuses to touch an already-submitted attempt), this function
-- is specifically for revising an attempt that is already submitted.

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

  -- Replace this attempt's recorded answers with the freshly re-graded set.
  -- Each row's is_correct/marks is computed by the caller using the CBT's
  -- current question data (current answer key and mark value), the same
  -- way a fresh submission would be scored.
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
