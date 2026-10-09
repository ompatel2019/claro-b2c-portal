-- One own-row, read-only query for Activity: counts cover every match, rows are paginated.
-- Deliberately not applied by the feature implementation.
create function public.activity_stats(p_filters jsonb, p_labels jsonb)
returns jsonb language sql stable security invoker set search_path = '' as $$
with mine as materialized (
  select s.id, s.kind, s.paper_id, s.config, s.started_at, s.finished_at, s.elapsed_s,
    (s.started_at at time zone 'Australia/Sydney')::date as day,
    coalesce(s.kind = 'flashcards' and s.config->>'mode' = 'study', false) as study,
    coalesce(a.answered, 0) as answered,
    coalesce(a.provisional, false) as provisional,
    case when s.finished_at is null then 'In progress' when a.pending then 'Marking'
      when a.provisional then 'Provisional' else 'Finished' end as status,
    case when a.pending then null else h.pct end as pct,
    coalesce(case s.kind when 'paper' then coalesce(p.title, s.config->>'title', p_labels->>'paper')
      when 'single' then p_labels->>'single'
      when 'flashcards' then p_labels->>case when s.config->>'mode' = 'test' then 'test' else 'study' end
      else coalesce(p_labels->>(s.config->>'mode'), 'Practice sprint') end, 'Practice')
      || coalesce(' · ' || names.names, '') as title,
    case when s.kind = 'flashcards' then coalesce(jsonb_array_length(s.config->'card_ids'), 0)
      else coalesce(a.items, 0) end as items
  from public.sessions s
  left join public.score_history h on h.id = s.id and h.user_id = (select auth.uid())
  left join public.papers p on p.id = s.paper_id
  left join lateral (
    select count(*) filter (where a.status <> 'skipped') as items,
      count(*) filter (where a.status <> 'skipped' and a.feedback->>'note' is distinct from 'No answer' and (a.choice_index is not null
        or nullif(btrim(a.transcript), '') is not null or nullif(btrim(a.answer_text), '') is not null
        or cardinality(a.image_paths) > 0)) as answered,
      bool_or(a.status in ('pending', 'transcribed', 'marking') or (a.status = 'marked' and a.check_status = 'pending')) as pending,
      bool_or(a.check_status = 'in_review') as provisional
    from public.attempts a where a.session_id = s.id and a.user_id = (select auth.uid())
  ) a on true
  left join lateral (
    select string_agg(coalesce(t.name, ids.id), ', ' order by ids.ord) as names
    from jsonb_array_elements_text(case
      when jsonb_array_length(coalesce(s.config->'subtopics', '[]')) > 0 then s.config->'subtopics'
      when jsonb_array_length(coalesce(s.config->'topics', '[]')) > 0 then s.config->'topics'
      when s.config->'question'->>'topic_id' is not null then jsonb_build_array(s.config->'question'->>'topic_id')
      else '[]'::jsonb end) with ordinality ids(id, ord)
    left join public.topics t on t.id = ids.id
  ) names on true
  where s.user_id = (select auth.uid()) and s.kind in ('sprint', 'paper', 'flashcards', 'single')
), scoped as materialized (
  select m.* from mine m where
    (coalesce(p_filters->>'status', '') = ''
      or p_filters->>'status' = 'progress' and status = 'In progress'
      or p_filters->>'status' = 'marking' and status = 'Marking'
      or p_filters->>'status' = 'finished' and finished_at is not null and status <> 'Marking'
      or p_filters->>'status' = 'provisional' and provisional)
    -- A heatmap day includes sessions whose answers/cards were counted on that day.
    and (case when coalesce(p_filters->>'date', '') <> '' then
      day = (p_filters->>'date')::date
      or exists (select 1 from public.attempts a where a.session_id = m.id
        and a.user_id = (select auth.uid()) and a.feedback->>'note' is distinct from 'No answer'
        and (a.choice_index is not null or nullif(btrim(a.transcript), '') is not null
          or nullif(btrim(a.answer_text), '') is not null or cardinality(a.image_paths) > 0)
        and (a.marked_at at time zone 'Australia/Sydney')::date = (p_filters->>'date')::date)
      or exists (select 1 from public.flashcard_reviews r where r.session_id = m.id
        and r.user_id = (select auth.uid())
        group by r.flashcard_id
        having (min(r.created_at) at time zone 'Australia/Sydney')::date = (p_filters->>'date')::date)
      else (coalesce(p_filters->>'from', '') = '' or day >= (p_filters->>'from')::date)
        and (coalesce(p_filters->>'to', '') = '' or day <= (p_filters->>'to')::date) end)
    and (coalesce(p_filters->>'q', '') = '' or position(lower(p_filters->>'q') in lower(title)) > 0)
    and (coalesce(p_filters->>'topic', '') = '' or exists (
      select 1 from public.topics t where (t.id = p_filters->>'topic' or t.parent_id = p_filters->>'topic') and (
        config->'topics' ? t.id or config->'subtopics' ? t.id or config->'question'->>'topic_id' = t.id
        or exists (select 1 from public.attempts a join public.questions q on q.id = a.question_id
          where a.session_id = m.id and a.user_id = (select auth.uid()) and q.topic_id = t.id)
        or exists (select 1 from public.flashcards f where config->'card_ids' ? f.id::text and f.topic_id = t.id)))
    )
), filtered as materialized (
  select * from scoped where coalesce(p_filters->>'kind', '') = '' or kind = p_filters->>'kind'
), totals as (
  select count(*) as total, coalesce(sum(answered) filter (where kind <> 'flashcards'), 0) as questions,
    avg(pct) filter (where not study and status <> 'Marking') as average,
    max(pct) filter (where not study and status <> 'Marking') as best from filtered
), paging as (
  select greatest(1, least(coalesce((p_filters->>'page')::integer, 1), greatest(1, ceil(total / 20.0)::integer))) as page from totals
), ordered as (
  select f.*, row_number() over (order by
    case when p_filters->>'sort' = 'oldest' then started_at end asc,
    case when p_filters->>'sort' = 'highest' then case when not study then pct end end desc nulls last,
    case when p_filters->>'sort' = 'lowest' then case when not study then pct end end asc nulls last,
    started_at desc, id desc) as n from filtered f
)
select jsonb_build_object(
  'rows', coalesce((select jsonb_agg(to_jsonb(o) - 'config' - 'day' - 'n' order by n)
    from ordered o where n > (paging.page - 1) * 20 and n <= paging.page * 20), '[]'::jsonb),
  'page', paging.page, 'total', totals.total, 'all_total', (select count(*) from mine),
  'kind_total', (select count(*) from scoped),
  'kinds', coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) n from scoped group by kind) k), '{}'::jsonb),
  'stats', jsonb_build_object('sessions', totals.total, 'questions', totals.questions, 'average', totals.average, 'best', totals.best)
) from totals cross join paging;
$$;
revoke all on function public.activity_stats(jsonb, jsonb) from public, anon;
grant execute on function public.activity_stats(jsonb, jsonb) to authenticated;
