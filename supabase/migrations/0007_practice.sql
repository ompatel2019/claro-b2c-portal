-- Phase 2a practice: flags, resumable timer, stale-claim recovery, one-query sprint builder and dashboard stats.
alter table public.attempts add column flagged boolean not null default false;
alter table public.attempts add column claimed_at timestamptz;
alter table public.sessions add column elapsed_s integer not null default 0 check (elapsed_s >= 0);

grant update (flagged) on public.attempts to authenticated;
grant update (elapsed_s) on public.sessions to authenticated;
create policy "own update while open" on public.sessions for update to authenticated
  using (user_id = (select auth.uid()) and finished_at is null)
  with check (user_id = (select auth.uid()) and finished_at is null);
create index on public.sessions (user_id) where finished_at is null;
create index on public.attempts (session_id, position);

-- Builds a sprint in one query: random questions per type up to the mode's mark targets, from up to two
-- topics/subtopics, preferring questions the student has not attempted in the last 14 days.
create or replace function public.start_sprint(p_mode text, p_topics text[])
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_targets jsonb := case p_mode
    when 'mcq' then '{"mcq": 20}'
    when 'short' then '{"short": 40}'
    when 'extended' then '{"extended": 20}'
    when 'mixed' then '{"mcq": 15, "short": 25, "extended": 20}'
  end;
  v_minutes int := case p_mode when 'mcq' then 20 when 'short' then 60 when 'extended' then 35 when 'mixed' then 75 end;
  v_topics text[] := coalesce(p_topics, '{}');
  v_session uuid;
begin
  if v_targets is null then raise exception 'invalid mode %', p_mode; end if;
  if cardinality(v_topics) > 2 then raise exception 'pick at most two topics'; end if;
  insert into public.sessions (kind, config)
  values ('sprint', jsonb_build_object('mode', p_mode, 'topics', to_jsonb(v_topics),
    'target_marks', (select sum(value::int) from jsonb_each_text(v_targets)), 'time_limit_min', v_minutes))
  returning id into v_session;

  insert into public.attempts (session_id, question_id, position)
  select v_session, id, row_number() over (order by array_position(array['mcq', 'short', 'extended'], type), rnd)
  from (
    select q.id, q.type, q.rnd,
      sum(q.marks) over (partition by q.type order by q.recent, q.rnd) as running
    from (
      select q.id, q.type, q.marks, random() as rnd,
        exists (select 1 from public.attempts a where a.question_id = q.id
          and a.user_id = (select auth.uid()) and a.created_at > now() - interval '14 days') as recent
      from public.questions q
      where v_targets ? q.type
        and (cardinality(v_topics) = 0 or q.topic_id = any(v_topics) or split_part(q.topic_id, '-', 1) = any(v_topics))
    ) q
  ) picked
  where running <= (v_targets ->> type)::int;

  if not found then raise exception 'no questions match these topics'; end if;
  return v_session;
end;
$$;
revoke execute on function public.start_sprint(text, text[]) from public, anon;
grant execute on function public.start_sprint(text, text[]) to authenticated;

-- Dashboard numbers for the signed-in student, in Sydney time.
create or replace function public.dashboard_stats()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select s.* from public.sessions s where s.user_id = (select auth.uid())
  ), days as (
    select distinct (finished_at at time zone 'Australia/Sydney')::date as d from mine where finished_at is not null
  ), runs as (
    select d, d - (row_number() over (order by d))::int as grp from days
  ), streak as (
    select count(*) as n from runs
    where grp = (select grp from runs order by d desc limit 1)
      and (select max(d) from days) >= (now() at time zone 'Australia/Sydney')::date - 1
  ), weak as (
    select t.id, t.name, round(100 * sum(a.mark) / nullif(sum(a.max_marks), 0)) as pct, count(*) as answered
    from public.attempts a
    join public.questions q on q.id = a.question_id
    join public.topics t on t.id = q.topic_id
    where a.user_id = (select auth.uid()) and a.status = 'marked' and a.max_marks > 0
    group by t.id, t.name
    having count(*) >= 2
    order by pct, answered desc
    limit 3
  )
  select jsonb_build_object(
    'sessions_this_week', (select count(*) from mine where finished_at at time zone 'Australia/Sydney'
      >= date_trunc('week', now() at time zone 'Australia/Sydney')),
    'average_pct', (select round(avg(100 * score / max_score)) from mine where finished_at is not null and max_score > 0),
    'finished_total', (select count(*) from mine where finished_at is not null),
    'streak_days', coalesce((select n from streak), 0),
    'weakest', coalesce((select jsonb_agg(weak) from weak), '[]'::jsonb)
  );
$$;
revoke execute on function public.dashboard_stats() from public, anon;
grant execute on function public.dashboard_stats() to authenticated;
