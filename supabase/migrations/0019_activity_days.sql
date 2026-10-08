-- One definition of an active day (§2.3), in Sydney time: questions answered (attempts with an
-- answer, on marked_at; "No answer" doesn't count) + flashcards reviewed (first review of each card
-- per session). Security invoker, so RLS limits students to their own rows and admins read anyone's.
create function public.activity_days(p_user uuid default auth.uid(), p_from date default null, p_to date default null)
returns table (day date, questions int, cards int)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select (a.marked_at at time zone 'Australia/Sydney')::date as day, count(*)::int as n
    from public.attempts a
    where a.user_id = p_user and a.marked_at is not null
      and a.feedback ->> 'note' is distinct from 'No answer'
      and (a.choice_index is not null or btrim(coalesce(a.answer_text, '')) <> ''
        or btrim(coalesce(a.transcript, '')) <> '' or cardinality(a.image_paths) > 0)
    group by 1
  ), c as (
    select (first_at at time zone 'Australia/Sydney')::date as day, count(*)::int as n
    from (
      select min(r.created_at) as first_at
      from public.flashcard_reviews r
      where r.user_id = p_user
      group by r.session_id, r.flashcard_id
    ) f
    group by 1
  )
  select day, coalesce(q.n, 0), coalesce(c.n, 0)
  from q full join c using (day)
  where (p_from is null or day >= p_from) and (p_to is null or day <= p_to)
  order by day;
$$;
revoke execute on function public.activity_days(uuid, date, date) from public, anon;
grant execute on function public.activity_days(uuid, date, date) to authenticated;

-- Current streak = consecutive active days ending today, or yesterday if today isn't active yet.
create function public.activity_streaks(p_user uuid default auth.uid())
returns table (current_streak int, longest_streak int)
language sql
stable
security invoker
set search_path = ''
as $$
  with runs as (
    select day, day - (row_number() over (order by day))::int as grp from public.activity_days(p_user)
  ), streaks as (
    select count(*)::int as n, max(day) as last from runs group by grp
  )
  select
    coalesce((select n from streaks
      where last >= (now() at time zone 'Australia/Sydney')::date - 1
      order by last desc limit 1), 0),
    coalesce((select max(n) from streaks), 0);
$$;
revoke execute on function public.activity_streaks(uuid) from public, anon;
grant execute on function public.activity_streaks(uuid) to authenticated;

-- dashboard_stats: the streak now uses the active-day definition above.
create or replace function public.dashboard_stats()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select s.* from public.sessions s where s.user_id = (select auth.uid())
  ), weak as (
    select t.id, t.name, round(100 * p.earned / p.possible) as pct, p.answered
    from public.topic_progress p
    join public.topics t on t.id = p.topic_id
    where p.user_id = (select auth.uid()) and p.possible > 0 and p.answered >= 3
    order by pct, p.answered desc
    limit 3
  )
  select jsonb_build_object(
    'sessions_this_week', (select count(*) from mine where finished_at at time zone 'Australia/Sydney'
      >= date_trunc('week', now() at time zone 'Australia/Sydney')),
    'average_pct', (select round(avg(100 * score / max_score)) from mine where finished_at is not null and max_score > 0),
    'finished_total', (select count(*) from mine where finished_at is not null),
    'streak_days', (select current_streak from public.activity_streaks()),
    'weakest', coalesce((select jsonb_agg(weak) from weak), '[]'::jsonb)
  );
$$;
