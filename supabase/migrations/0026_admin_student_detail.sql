-- §4.3 only. Existing dashboard/list aggregates and student RPCs stay unchanged.
create function public.admin_student_detail(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Australia/Sydney')::date;
  v_monday date := date_trunc('week', now() at time zone 'Australia/Sydney')::date;
  v_result jsonb;
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'admin only'; end if;
  with days as (
    select * from public.activity_days(p_user, v_monday - 7, v_today)
  ), marks as (
    select a.mark, a.max_marks, (a.marked_at at time zone 'Australia/Sydney')::date as day
    from public.attempts a
    where a.user_id = p_user and a.status = 'marked' and a.check_status <> 'pending'
      and a.mark is not null and a.max_marks > 0 and a.marked_at <= now()
      and a.marked_at >= ((v_today - 59)::timestamp at time zone 'Australia/Sydney')
  ), usage as (
    select u.task, count(*) as calls, sum(u.input_tokens + u.output_tokens) as tokens, sum(u.usd) as usd
    from public.ai_usage u where u.user_id = p_user and u.created_at between now() - interval '30 days' and now()
    group by u.task
  ), activity as (
    select s.started_at as at from public.sessions s where s.user_id = p_user
    union all select s.finished_at from public.sessions s where s.user_id = p_user
    union all select a.marked_at from public.attempts a where a.user_id = p_user
    union all select r.created_at from public.flashcard_reviews r where r.user_id = p_user
  )
  select jsonb_build_object(
    'week', jsonb_build_object('thisWeek', coalesce((select sum(questions) from days where day >= v_monday), 0),
      'lastWeek', coalesce((select sum(questions) from days where day < v_monday), 0)),
    'averages', jsonb_build_object('avg30', (select 100 * sum(mark) / nullif(sum(max_marks), 0) from marks where day >= v_today - 29),
      'prev30', (select 100 * sum(mark) / nullif(sum(max_marks), 0) from marks where day < v_today - 29)),
    'due', jsonb_build_object('today', (select count(*) from public.flashcard_progress where user_id = p_user and due_on <= v_today),
      'tomorrow', (select count(*) from public.flashcard_progress where user_id = p_user and due_on = v_today + 1)),
    'streaks', (select to_jsonb(s) from public.activity_streaks(p_user) s),
    'lastActive', (select max(at) from activity where at <= now()),
    'callsLastHour', (select count(*) from public.ai_usage where user_id = p_user and created_at between now() - interval '1 hour' and now()),
    'spend30', coalesce((select sum(usd) from usage), 0),
    'usage', coalesce((select jsonb_agg(usage order by task) from usage), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- Page attempts independently: embedded PostgREST arrays have their own row cap.
create function public.admin_student_attempts(p_user uuid)
returns table (id uuid, session_id uuid, status text, check_status text, answered boolean, day date)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'admin only'; end if;
  return query select a.id, a.session_id, a.status, a.check_status,
    a.feedback->>'note' is distinct from 'No answer' and
      (a.choice_index is not null or btrim(coalesce(a.answer_text, '')) <> ''
        or btrim(coalesce(a.transcript, '')) <> '' or coalesce(cardinality(a.image_paths), 0) > 0),
    (a.marked_at at time zone 'Australia/Sydney')::date
  from public.attempts a where a.user_id = p_user;
end;
$$;

-- Settled marks only; parent totals and untouched topics are composed in the UI.
create function public.admin_student_topics(p_user uuid)
returns table (topic_id text, parent_id text, earned numeric, possible bigint, answered bigint, last_answered timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'admin only'; end if;
  return query with marked as (
    select q.topic_id, a.mark, a.max_marks, a.marked_at,
      a.feedback->>'note' is distinct from 'No answer' and
        (a.choice_index is not null or btrim(coalesce(a.answer_text, '')) <> ''
          or btrim(coalesce(a.transcript, '')) <> '' or coalesce(cardinality(a.image_paths), 0) > 0) as answered
    from public.attempts a join public.questions q on q.id = a.question_id
    where a.user_id = p_user and a.status = 'marked' and a.check_status <> 'pending'
      and a.mark is not null and a.marked_at <= now()
  ), expanded as (
    select m.* from marked m
    union all select t.parent_id, m.mark, m.max_marks, m.marked_at, m.answered
      from marked m join public.topics t on t.id = m.topic_id where t.parent_id is not null
  )
  select m.topic_id, t.parent_id, sum(m.mark), sum(m.max_marks), count(*) filter (where m.answered), max(m.marked_at)
  from expanded m join public.topics t on t.id = m.topic_id group by m.topic_id, t.parent_id;
end;
$$;

-- Lock the attempt, reuse its open review, and update its state in one transaction.
create function public.admin_open_student_review(p_attempt uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_attempt public.attempts%rowtype; v_review uuid;
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'admin only'; end if;
  select * into v_attempt from public.attempts where id = p_attempt for update;
  if not found then raise exception 'Attempt missing'; end if;
  if not exists (select 1 from public.sessions s where s.id = v_attempt.session_id and s.finished_at is not null)
    or (v_attempt.question_id is not null and exists (select 1 from public.questions q where q.id = v_attempt.question_id and q.type = 'mcq'))
    or v_attempt.status not in ('marked', 'failed', 'unreadable')
    or (v_attempt.status = 'marked' and v_attempt.check_status = 'pending')
  then raise exception 'Only finished written answers can be reviewed'; end if;
  select id into v_review from public.mark_reviews where attempt_id = p_attempt and status = 'open';
  if v_review is null then
    insert into public.mark_reviews (attempt_id, user_id, reason, ai_mark, ai_model)
    values (p_attempt, v_attempt.user_id, 'spot_check', v_attempt.mark, v_attempt.marked_by_model)
    on conflict (attempt_id) where status = 'open' do nothing returning id into v_review;
    if v_review is null then
      select id into v_review from public.mark_reviews where attempt_id = p_attempt and status = 'open';
    end if;
  end if;
  update public.attempts set check_status = 'in_review' where id = p_attempt;
  return v_review;
end;
$$;

revoke execute on function public.admin_student_detail(uuid), public.admin_student_attempts(uuid),
  public.admin_student_topics(uuid), public.admin_open_student_review(uuid) from public, anon;
grant execute on function public.admin_student_detail(uuid), public.admin_student_attempts(uuid),
  public.admin_student_topics(uuid), public.admin_open_student_review(uuid) to authenticated;
