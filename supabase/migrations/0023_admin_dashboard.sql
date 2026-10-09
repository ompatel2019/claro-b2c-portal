-- §4.1: aggregate in SQL, without PostgREST's row limit or browser-visible bank data.
create function public.admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Australia/Sydney')::date;
  v_week date := date_trunc('week', now() at time zone 'Australia/Sydney')::date;
  v_result jsonb;
begin
  if not (select public.is_admin()) then raise exception 'admin only'; end if;
  with
  days as (select v_today - n as day from generate_series(0, 29) n),
  recent_sessions as (
    select s.user_id, (s.started_at at time zone 'Australia/Sydney')::date as day
    from public.sessions s join public.profiles p on p.id = s.user_id and p.role = 'student'
    where s.started_at >= ((v_today - 29)::timestamp at time zone 'Australia/Sydney')
      and s.started_at <= now()
  ),
  activity as (
    select s.user_id, s.started_at as at from public.sessions s
    union all select s.user_id, s.finished_at from public.sessions s where s.finished_at is not null
    union all select a.user_id, a.marked_at from public.attempts a where a.marked_at is not null
    union all select r.user_id, r.created_at from public.flashcard_reviews r
  ),
  student_activity as (
    select a.user_id, (a.at at time zone 'Australia/Sydney')::date as day
    from activity a join public.profiles p on p.id = a.user_id and p.role = 'student'
    where a.at >= ((v_today - 13)::timestamp at time zone 'Australia/Sydney') and a.at <= now()
  ),
  session_days as (select day, count(*) as value from recent_sessions group by day),
  spend_days as (
    select (u.created_at at time zone 'Australia/Sydney')::date as day, sum(u.usd) as value
    from public.ai_usage u
    where u.created_at >= ((v_today - 29)::timestamp at time zone 'Australia/Sydney') and u.created_at <= now()
    group by 1
  ),
  checked as (
    select a.check_status,
      exists (select 1 from public.mark_reviews r where r.attempt_id = a.id and r.reason = 'check_disagreed') as disagreed
    from public.attempts a
    where a.status = 'marked' and a.check_status <> 'skipped'
      and a.marked_at >= (v_week::timestamp at time zone 'Australia/Sydney') and a.marked_at <= now()
  ),
  latest as (
    select s.id, s.user_id, coalesce(nullif(p.full_name, ''), 'Student') as name,
      s.kind, s.config->>'mode' as mode, s.score, s.max_score as max, s.finished_at
    from public.sessions s join public.profiles p on p.id = s.user_id and p.role = 'student'
    where s.finished_at is not null
    order by s.finished_at desc, s.id desc limit 10
  )
  select jsonb_build_object(
    'students', (select count(*) from public.profiles where role = 'student'),
    'active', jsonb_build_object(
      'now', (select count(distinct user_id) from student_activity where day >= v_today - 6),
      'prev', (select count(distinct user_id) from student_activity where day between v_today - 13 and v_today - 7)),
    'sessionsWeek', (select count(*) from recent_sessions where day >= v_today - 6),
    'openReviews', (select jsonb_build_object('count', count(*), 'oldestDays',
      v_today - (min(created_at) at time zone 'Australia/Sydney')::date)
      from public.mark_reviews where status = 'open'),
    'spend', (select jsonb_build_object('month', coalesce(sum(usd) filter (where
      created_at >= (date_trunc('month', v_today::timestamp) at time zone 'Australia/Sydney')), 0),
      'all', coalesce(sum(usd), 0)) from public.ai_usage where created_at <= now()),
    'sessionsTotal', (select count(*) from recent_sessions),
    'spendTotal', (select coalesce(sum(value), 0) from spend_days),
    'sessionsPerDay', (select jsonb_agg(jsonb_build_object('day', d.day, 'value', coalesce(s.value, 0)) order by d.day)
      from days d left join session_days s using (day)),
    'spendPerDay', (select jsonb_agg(jsonb_build_object('day', d.day, 'value', coalesce(s.value, 0)) order by d.day)
      from days d left join spend_days s using (day)),
    'attention', jsonb_build_object(
      'failed', (select count(*) from public.attempts where status in ('failed', 'unreadable')
        and created_at >= ((v_today - 6)::timestamp at time zone 'Australia/Sydney') and created_at <= now()),
      'newFeedback', (select count(*) from public.feedback where status = 'new'),
      'contentReports', (select count(*) from public.feedback where kind = 'content' and status <> 'resolved'),
      'importReview', (select count(*) from public.questions d where d.status = 'draft' and (
        d.duplicate_of is not null or exists (select 1 from public.questions q where q.id <> d.id
          and q.status <> 'retired' and q.stem operator(extensions.%) d.stem
          and extensions.similarity(d.stem, q.stem) >= 0.82))),
      'agreement', (select 100.0 * count(*) filter (where check_status = 'agreed' or
        (check_status in ('in_review', 'reviewed') and not disagreed)) / nullif(count(*), 0) from checked)),
    'latest', (select coalesce(jsonb_agg(to_jsonb(l) order by l.finished_at desc, l.id desc), '[]'::jsonb) from latest l)
  ) into v_result;
  return v_result;
end;
$$;
revoke execute on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated;
