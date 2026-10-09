-- The students list averaged only answered attempts (37%) while Home, Progress and the student detail count
-- every marked attempt, "Not answered" as 0 (17%). The list now uses the student-facing definition: marks
-- earned / marks possible over the last 30 Sydney days. "Questions answered" still counts answered attempts only.
-- Same signature; create or replace only (additive).
create or replace function public.admin_student_rows()
returns table (
  id uuid, full_name text, year_level smallint, school text, joined timestamptz,
  last_active timestamptz, sessions_7d bigint, sessions_total bigint,
  answered bigint, avg_30 numeric, streak int, open_disputes bigint, ai_spend numeric
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Australia/Sydney')::date;
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'admin only'; end if;
  return query
  with sessions as (
    select s.user_id, count(*) as total,
      count(*) filter (where s.started_at >= ((v_today - 6)::timestamp at time zone 'Australia/Sydney')) as recent
    from public.sessions s where s.started_at <= now() group by s.user_id
  ), marks as (
    select a.user_id,
      count(*) filter (where a.feedback->>'note' is distinct from 'No answer'
        and (a.choice_index is not null or btrim(coalesce(a.answer_text, '')) <> ''
          or btrim(coalesce(a.transcript, '')) <> '' or cardinality(a.image_paths) > 0)) as answered,
      round(100 * sum(a.mark) filter (where a.status = 'marked' and a.check_status <> 'pending'
        and a.max_marks > 0 and a.mark is not null
        and a.marked_at >= ((v_today - 29)::timestamp at time zone 'Australia/Sydney')) /
        nullif(sum(a.max_marks) filter (where a.status = 'marked' and a.check_status <> 'pending'
        and a.max_marks > 0 and a.mark is not null
        and a.marked_at >= ((v_today - 29)::timestamp at time zone 'Australia/Sydney')), 0)) as avg
    from public.attempts a where a.marked_at <= now() group by a.user_id
  ), activity as (
    select s.user_id, s.started_at as at from public.sessions s
    union all select s.user_id, s.finished_at from public.sessions s where s.finished_at is not null
    union all select a.user_id, a.marked_at from public.attempts a where a.marked_at is not null
    union all select r.user_id, r.created_at from public.flashcard_reviews r
  ), last_activity as (
    select a.user_id, max(a.at) as at from activity a where a.at <= now() group by a.user_id
  ), disputes as (
    select r.user_id, count(*) as n from public.mark_reviews r
    where r.status = 'open' and r.reason = 'student_dispute' group by r.user_id
  ), spend as (
    select u.user_id, sum(u.usd) as usd from public.ai_usage u
    where u.created_at <= now() group by u.user_id
  )
  select p.id, p.full_name, p.year_level, p.school, p.created_at, l.at,
    coalesce(s.recent, 0), coalesce(s.total, 0), coalesce(m.answered, 0), m.avg,
    st.current_streak, coalesce(d.n, 0), coalesce(u.usd, 0)
  from public.profiles p
  left join sessions s on s.user_id = p.id
  left join marks m on m.user_id = p.id
  left join last_activity l on l.user_id = p.id
  left join disputes d on d.user_id = p.id
  left join spend u on u.user_id = p.id
  cross join lateral public.activity_streaks(p.id) st
  where p.role = 'student';
end;
$$;
revoke execute on function public.admin_student_rows() from public, anon;
grant execute on function public.admin_student_rows() to authenticated;
