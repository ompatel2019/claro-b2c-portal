-- Progress views, the post-finish review function, the config-based sprint builder,
-- one-question 'single' sessions (Mark my answer) and admin read of spaced-repetition state.

create view public.score_history with (security_invoker = true) as
select user_id, id, kind, config ->> 'mode' as mode, paper_id, finished_at, score, max_score,
  round(100 * score / nullif(max_score, 0), 1) as pct
from public.sessions
where finished_at is not null;

create view public.topic_progress with (security_invoker = true) as
select a.user_id, q.topic_id, t.parent_id,
  sum(a.mark) as earned, sum(a.max_marks) as possible,
  count(*) as answered, max(a.marked_at) as last_answered
from public.attempts a
join public.questions q on q.id = a.question_id
join public.topics t on t.id = q.topic_id
where a.status = 'marked'
group by a.user_id, q.topic_id, t.parent_id;

revoke all on public.score_history, public.topic_progress from anon;
grant select on public.score_history, public.topic_progress to authenticated;

-- Dashboard numbers in Sydney time; weak spots come from topic_progress.
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
    'streak_days', coalesce((select n from streak), 0),
    'weakest', coalesce((select jsonb_agg(weak) from weak), '[]'::jsonb)
  );
$$;

-- Answer keys, criteria and model answers, only for a finished session the caller owns (or any, for admins).
create function public.session_review(p_session uuid)
returns table (
  attempt_id uuid, "position" smallint, question_id text, type text, marks smallint,
  stem text, stimulus text, options text[], source text,
  choice_index smallint, answer_text text, transcript text, image_paths text[], flagged boolean,
  status text, check_status text, mark numeric, max_marks smallint, band text, feedback jsonb,
  correct_index smallint, criteria jsonb, sample_answer text, explanation text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.position, a.question_id, q.type, q.marks, q.stem, q.stimulus, q.options, q.source,
    a.choice_index, a.answer_text, a.transcript, a.image_paths, a.flagged,
    a.status, a.check_status, a.mark, a.max_marks, a.band, a.feedback,
    q.correct_index, q.criteria, q.sample_answer, q.explanation
  from public.sessions s
  join public.attempts a on a.session_id = s.id
  left join public.questions q on q.id = a.question_id
  where s.id = p_session and s.finished_at is not null
    and (s.user_id = (select auth.uid()) or (select public.is_admin()))
  order by a.position;
$$;
revoke execute on function public.session_review(uuid) from public, anon;
grant execute on function public.session_review(uuid) to authenticated;

-- Topic Sprint from a config object: {mode, topics[<=2], subtopics[], target_marks, time_limit_min}.
-- target_marks null = the mode's default; time_limit_min null = untimed (absent = the mode's default).
-- Draws live questions only, never ones in a live paper, preferring ones not attempted in the last 14 days.
drop function public.start_sprint(text, text[]);
create function public.start_sprint(p_config jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mode text := p_config ->> 'mode';
  v_defaults jsonb := case v_mode
    when 'mcq' then '{"mcq": 20}'
    when 'short' then '{"short": 40}'
    when 'extended' then '{"extended": 20}'
    when 'mixed' then '{"mcq": 15, "short": 25, "extended": 20}'
  end;
  v_default_total int;
  v_target int;
  v_targets jsonb;
  v_minutes int;
  v_topics text[];
  v_subtopics text[];
  v_session uuid;
begin
  if jsonb_typeof(p_config) is distinct from 'object' or v_defaults is null then
    raise exception 'invalid mode %', v_mode;
  end if;
  v_topics := array(select jsonb_array_elements_text(coalesce(p_config -> 'topics', '[]')));
  v_subtopics := array(select jsonb_array_elements_text(coalesce(p_config -> 'subtopics', '[]')));
  if cardinality(v_topics) > 2 then raise exception 'pick at most two topics'; end if;
  select sum(value::int) into v_default_total from jsonb_each_text(v_defaults);
  v_target := coalesce((p_config ->> 'target_marks')::int, v_default_total);
  if v_target not between 1 and 100 then raise exception 'target marks must be 1 to 100'; end if;
  select jsonb_object_agg(key, greatest(1, round(value::int * v_target::numeric / v_default_total)))
    into v_targets from jsonb_each_text(v_defaults);
  v_minutes := case when p_config ? 'time_limit_min' then (p_config ->> 'time_limit_min')::int
    else case v_mode when 'mcq' then 20 when 'short' then 60 when 'extended' then 35 else 75 end end;
  if v_minutes not between 1 and 240 then raise exception 'time limit must be 1 to 240 minutes'; end if;

  insert into public.sessions (kind, config)
  values ('sprint', jsonb_build_object('mode', v_mode, 'topics', to_jsonb(v_topics), 'subtopics', to_jsonb(v_subtopics),
    'target_marks', v_target, 'time_limit_min', v_minutes))
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
      where v_targets ? q.type and q.status = 'live'
        and (cardinality(v_topics) = 0 or q.topic_id = any(v_topics) or split_part(q.topic_id, '-', 1) = any(v_topics))
        and (cardinality(v_subtopics) = 0 or q.topic_id = any(v_subtopics))
        and not exists (select 1 from public.paper_questions pq join public.papers p on p.id = pq.paper_id
          where pq.question_id = q.id and p.status = 'live')
    ) q
  ) picked
  where running <= (v_targets ->> type)::int;

  if not found then raise exception 'no questions match these topics'; end if;
  return v_session;
end;
$$;
revoke execute on function public.start_sprint(jsonb) from public, anon;
grant execute on function public.start_sprint(jsonb) to authenticated;

-- 'single' = Mark my answer: one attempt; question_id may be null only there (question text lives in config).
alter table public.sessions drop constraint sessions_kind_check;
alter table public.sessions add constraint sessions_kind_check check (kind in ('sprint', 'flashcards', 'paper', 'single'));
alter table public.attempts alter column question_id drop not null;
create function public.attempts_question_required() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.question_id is null
    and (select kind from public.sessions where id = new.session_id) is distinct from 'single' then
    raise exception 'question_id is required outside single sessions';
  end if;
  return new;
end $$;
revoke execute on function public.attempts_question_required() from public, anon, authenticated;
create trigger attempts_question_required before insert or update of question_id, session_id on public.attempts
  for each row execute function public.attempts_question_required();

create policy "admin read" on public.flashcard_progress for select to authenticated
  using ((select public.is_admin()));
