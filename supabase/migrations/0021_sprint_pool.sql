-- §3.2 Topic Sprint: one filter function shared by the live pool counts and the builder.
-- "Seen" = answered in a finished session; skipped or blank rows never count.

create index if not exists attempts_user_id_question_id_idx on public.attempts (user_id, question_id);
-- Source filter (HSC vs trial) needs origin; it holds no answer content.
grant select (origin) on public.questions to authenticated;

-- Candidate questions for a sprint config, with the caller's history.
-- Filters: mode (+ include_extended), topics, subtopics, difficulty, verbs, year_from/to, origins.
-- Difficulty and verbs apply to written questions only.
create function public.sprint_questions(p_config jsonb)
returns table (id text, type text, marks smallint, topic_id text, year smallint, verb text, origin text,
  source text, seen boolean, last_seen timestamptz, mistake boolean, flagged boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with cfg as (
    select
      case p_config ->> 'mode'
        when 'mcq' then array['mcq'] when 'short' then array['short'] when 'extended' then array['extended']
        when 'mixed' then case when (p_config ->> 'include_extended')::boolean then array['mcq', 'short', 'extended']
          else array['mcq', 'short'] end
      end as types,
      array(select jsonb_array_elements_text(coalesce(p_config -> 'topics', '[]'))) as topics,
      array(select jsonb_array_elements_text(coalesce(p_config -> 'subtopics', '[]'))) as subtopics,
      array(select jsonb_array_elements_text(coalesce(p_config -> 'difficulty', '[]'))) as difficulty,
      array(select jsonb_array_elements_text(coalesce(p_config -> 'verbs', '[]'))) as verbs,
      array(select jsonb_array_elements_text(coalesce(p_config -> 'origins', '[]'))) as origins,
      (p_config ->> 'year_from')::int as year_from,
      (p_config ->> 'year_to')::int as year_to
  ), history as (
    select distinct on (a.question_id) a.question_id, s.finished_at,
      a.mark < a.max_marks as mistake, a.flagged
    from public.attempts a
    join public.sessions s on s.id = a.session_id
    where a.user_id = (select auth.uid()) and s.finished_at is not null and a.status <> 'skipped'
      and (a.choice_index is not null or coalesce(trim(coalesce(a.transcript, a.answer_text)), '') <> '')
    order by a.question_id, s.finished_at desc
  )
  select q.id, q.type, q.marks, q.topic_id, q.year, q.verb, q.origin, q.source,
    h.question_id is not null, h.finished_at, coalesce(h.mistake, false), coalesce(h.flagged, false)
  from public.questions q
  cross join cfg
  left join history h on h.question_id = q.id
  where q.status = 'live' and q.type = any(cfg.types)
    and (cardinality(cfg.topics) = 0 or split_part(q.topic_id, '-', 1) = any(cfg.topics))
    and (cardinality(cfg.subtopics) = 0 or q.topic_id = any(cfg.subtopics)
      or not exists (select 1 from unnest(cfg.subtopics) s where split_part(s, '-', 1) = split_part(q.topic_id, '-', 1)))
    and (q.type = 'mcq' or cardinality(cfg.difficulty) = 0
      or (case when q.marks <= 3 then 'foundation' when q.marks <= 5 then 'standard' else 'challenging' end) = any(cfg.difficulty))
    and (q.type = 'mcq' or cardinality(cfg.verbs) = 0 or q.verb = any(cfg.verbs))
    and (cardinality(cfg.origins) = 0 or q.origin = any(cfg.origins))
    and (cfg.year_from is null or q.year >= cfg.year_from)
    and (cfg.year_to is null or q.year <= cfg.year_to)
    and not exists (select 1 from public.paper_questions pq join public.papers p on p.id = pq.paper_id
      where pq.question_id = q.id and p.status = 'live');
$$;
revoke execute on function public.sprint_questions(jsonb) from public, anon;
grant execute on function public.sprint_questions(jsonb) to authenticated;

-- Live counts for the setup page. Facet counts ignore their own facet so a chip shows what it would add.
create function public.sprint_pool(p_config jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with pool as (select * from public.sprint_questions(p_config)),
  hist as (
    select * from pool where case coalesce(p_config ->> 'history', 'prefer_new')
      when 'new_only' then not seen when 'mistakes' then mistake when 'flagged' then flagged else true end
  )
  select jsonb_build_object(
    'questions', (select count(*) from hist),
    'marks', (select coalesce(sum(marks), 0) from hist),
    'by_type', (select coalesce(jsonb_object_agg(type, n), '{}') from (select type, count(*) n from hist group by type) t),
    'any', (select count(*) from pool),
    'new', (select count(*) from pool where not seen),
    'mistakes', (select count(*) from pool where mistake),
    'flagged', (select count(*) from pool where flagged),
    'topics', (select coalesce(jsonb_object_agg(t, n), '{}') from (select split_part(topic_id, '-', 1) t, count(*) n
      from public.sprint_questions(p_config - 'topics' - 'subtopics') group by 1) x),
    'subtopics', (select coalesce(jsonb_object_agg(topic_id, n), '{}') from (select topic_id, count(*) n
      from public.sprint_questions(p_config - 'subtopics') group by 1) x),
    'all_subtopics', (select count(*) from public.sprint_questions(p_config - 'subtopics')),
    'verbs', (select coalesce(jsonb_object_agg(verb, n), '{}') from (select verb, count(*) n
      from public.sprint_questions(p_config - 'verbs') where verb is not null group by 1) x),
    'difficulty', (select coalesce(jsonb_object_agg(d, n), '{}') from (select
      case when marks <= 3 then 'foundation' when marks <= 5 then 'standard' else 'challenging' end d, count(*) n
      from public.sprint_questions(p_config - 'difficulty') where type <> 'mcq' group by 1) x),
    'all_years', (select count(*) from public.sprint_questions(p_config - 'year_from' - 'year_to')),
    'years', (select jsonb_build_array(min(q.year), max(q.year)) from public.questions q where q.status = 'live'),
    'trial', exists (select 1 from public.questions q where q.status = 'live' and q.origin = 'a1')
  );
$$;
revoke execute on function public.sprint_pool(jsonb) from public, anon;
grant execute on function public.sprint_pool(jsonb) to authenticated;

-- Builds the sprint from the §3.2 config. Selection is random within the filters (history decides
-- priority); order is presentation only. Marks land within ±2 of the target where the pool allows.
-- Missing settings take the §3.2 defaults (so quick starts can send just a mode).
drop function public.start_sprint(jsonb);
create function public.start_sprint(p_config jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mode text := p_config ->> 'mode';
  v_size_by text := coalesce(p_config ->> 'size_by', case when v_mode in ('mcq', 'extended') then 'questions' else 'marks' end);
  v_target int := coalesce((p_config ->> 'target')::int,
    case v_mode when 'mcq' then 20 when 'short' then 30 when 'extended' then 1 else 45 end);
  v_history text := coalesce(p_config ->> 'history', 'prefer_new');
  v_order text := coalesce(p_config ->> 'order', 'exam');
  v_timed boolean := coalesce((p_config ->> 'timed')::boolean, true);
  v_pace text := coalesce(p_config ->> 'pace', 'hsc');
  v_on_timeout text := coalesce(p_config ->> 'on_timeout', 'overtime');
  v_feedback text := coalesce(p_config ->> 'feedback', 'end');
  v_extended boolean := v_mode = 'mixed' and coalesce((p_config ->> 'include_extended')::boolean, false);
  v_lo int;
  v_hi int;
  v_mcq_target int;
  v_mcq_n int := 0;
  v_ext_n int := 0;
  v_short_marks int := 0;
  v_picked text[] := '{}';
  v_sum int := 0;
  v_count int := 0;
  v_limit int;
  v_session uuid;
  r record;
begin
  if jsonb_typeof(p_config) is distinct from 'object' or v_mode is null
    or v_mode not in ('mcq', 'short', 'extended', 'mixed') then raise exception 'invalid mode %', v_mode; end if;
  if jsonb_array_length(coalesce(p_config -> 'topics', '[]')) > 2 then raise exception 'pick at most two topics'; end if;
  if v_history not in ('prefer_new', 'new_only', 'mistakes', 'flagged', 'any')
    or v_order not in ('exam', 'shuffled') or v_pace not in ('hsc', 'relaxed', 'custom')
    or v_on_timeout not in ('overtime', 'finish') or v_feedback not in ('end', 'each')
    then
    raise exception 'invalid sprint settings';
  end if;
  select lo, hi into v_lo, v_hi from (values
    ('mcq', 'questions', 5, 40), ('short', 'marks', 10, 60), ('short', 'questions', 2, 15),
    ('extended', 'questions', 1, 3), ('mixed', 'marks', 20, 100)) b(mode, size_by, lo, hi)
  where b.mode = v_mode and b.size_by = v_size_by;
  if v_lo is null or v_target is null or v_target not between v_lo and v_hi then
    raise exception 'size is out of range';
  end if;
  -- Mixed keeps the HSC paper balance: about 40% of the marks from multiple choice.
  v_mcq_target := case when v_mode = 'mixed' then round(v_target * 0.4) end;

  for r in
    select q.* from public.sprint_questions(p_config) q
    where case v_history when 'new_only' then not q.seen when 'mistakes' then q.mistake
      when 'flagged' then q.flagged else true end
    order by case when v_history = 'prefer_new' then q.seen end, case when v_history = 'prefer_new' then q.last_seen end,
      random()
  loop
    if v_mode = 'mixed' then
      continue when case r.type
        when 'extended' then not v_extended or v_ext_n > 0
        when 'mcq' then v_mcq_n >= v_mcq_target
        else v_short_marks + r.marks > v_target - v_mcq_target end;
      v_mcq_n := v_mcq_n + (r.type = 'mcq')::int;
      v_ext_n := v_ext_n + (r.type = 'extended')::int;
      v_short_marks := v_short_marks + case when r.type = 'short' then r.marks else 0 end;
    elsif v_size_by = 'questions' then
      exit when v_count >= v_target;
    else
      continue when v_sum + r.marks > v_target;
    end if;
    v_picked := v_picked || r.id;
    v_sum := v_sum + r.marks;
    v_count := v_count + 1;
    exit when v_size_by = 'marks' and v_mode <> 'mixed' and v_sum >= v_target;
  end loop;

  if v_count = 0 then raise exception 'no questions match these settings'; end if;

  v_limit := case
    when not v_timed then null
    when v_pace = 'custom' then (p_config ->> 'custom_minutes')::int * 60
    else round((select sum(case x.type when 'mcq' then 60 when 'short' then 90 * x.marks else 2100 end)
      from public.questions x where x.id = any(v_picked)) * case when v_pace = 'relaxed' then 1.5 else 1 end)
  end;
  if v_timed and v_pace = 'custom' and (v_limit is null or v_limit not between 300 and 10800) then
    raise exception 'custom time must be 5 to 180 minutes';
  end if;

  insert into public.sessions (kind, config)
  values ('sprint', jsonb_build_object(
    'mode', v_mode, 'include_extended', v_extended,
    'topics', coalesce(p_config -> 'topics', '[]'), 'subtopics', coalesce(p_config -> 'subtopics', '[]'),
    'size_by', v_size_by, 'target', v_target,
    'difficulty', coalesce(p_config -> 'difficulty', '[]'), 'verbs', coalesce(p_config -> 'verbs', '[]'),
    'year_from', p_config -> 'year_from', 'year_to', p_config -> 'year_to', 'origins', coalesce(p_config -> 'origins', '[]'),
    'history', v_history, 'order', v_order,
    'timed', v_timed, 'time_limit_s', v_limit, 'pace', v_pace, 'on_timeout', v_on_timeout,
    'feedback', v_feedback, 'actual_marks', v_sum, 'actual_questions', v_count))
  returning id into v_session;

  insert into public.attempts (session_id, question_id, position)
  select v_session, q.id, row_number() over (order by
    case when v_order = 'exam' then array_position(array['mcq', 'short', 'extended'], q.type) end,
    case when v_order = 'exam' then q.year end,
    case when v_order = 'exam' then (substring(q.source from 'Q(\d+)'))::int end,
    case when v_order = 'exam' then q.source end,
    random())
  from public.questions q where q.id = any(v_picked);
  return v_session;
end;
$$;
revoke execute on function public.start_sprint(jsonb) from public, anon;
grant execute on function public.start_sprint(jsonb) to authenticated;
