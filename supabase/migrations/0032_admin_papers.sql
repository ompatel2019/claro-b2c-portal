-- Preserve empty sections and their order; question text remains in the bank.
alter table public.papers add column section_names jsonb;
-- Additive only: papers_total_marks_check (> 0) stays; a draft with no
-- questions stores 1 and the admin list shows 0 marks while it has none.

-- Aggregate the complete sit history before the Data API paginates paper rows.
create function public.admin_paper_rows()
returns table (id uuid, title text, year smallint, source text, origin text,
  questions bigint, total_marks smallint, time_limit_min smallint, status text,
  first_sits bigint, all_sits bigint, avg numeric, ranks_enabled boolean,
  updated_at timestamptz, started bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  return query
  with stats as (
    select s.paper_id, count(*) as started,
      count(distinct s.user_id) filter (where s.finished_at is not null) as first_sits,
      count(*) filter (where s.finished_at is not null) as all_sits,
      round(avg(100.0 * s.score / nullif(s.max_score, 0))
        filter (where s.finished_at is not null)) as avg
    from public.sessions s where s.paper_id is not null group by s.paper_id
  ), counts as (
    select pq.paper_id, count(*) as questions from public.paper_questions pq group by pq.paper_id
  )
  select p.id, p.title, p.year, p.source, p.origin, coalesce(c.questions, 0),
    p.total_marks, p.time_limit_min, p.status, coalesce(s.first_sits, 0),
    coalesce(s.all_sits, 0), s.avg, p.ranks_enabled, p.updated_at, coalesce(s.started, 0)
  from public.papers p left join stats s on s.paper_id = p.id
    left join counts c on c.paper_id = p.id;
end;
$$;
revoke all on function public.admin_paper_rows() from public, anon;
grant execute on function public.admin_paper_rows() to authenticated;

-- One transaction: lock, validate bank facts, publish drafts if explicitly requested,
-- replace structure and save details. Any failure rolls the entire operation back.
create function public.admin_save_paper(p_id uuid, p_input jsonb, p_status text,
  p_publish_drafts boolean, p_expected timestamptz)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_paper public.papers;
  v_rows jsonb;
  v_total integer;
  v_locked boolean;
  v_version timestamptz;
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  select * into v_paper from public.papers where id = p_id for update;
  if not found then raise exception 'This paper no longer exists.'; end if;
  if p_expected is null or v_paper.updated_at <> p_expected then
    raise exception 'This paper changed. Reload before saving.';
  end if;
  if p_status is null or p_status not in ('draft', 'live', 'retired')
    or (p_status = 'draft' and v_paper.status <> 'draft')
    or (p_status = 'retired' and v_paper.status = 'draft') then
    raise exception 'Invalid status change.';
  end if;
  if coalesce(length(btrim(p_input->>'title')), 0) not between 1 and 80
    or coalesce(length(p_input->>'source'), 0) > 60
    or p_input->>'time_limit_min' is null
    or (p_input->>'time_limit_min')::integer not between 30 and 240
    or (p_input->>'time_limit_min')::integer % 5 <> 0
    or (p_input->>'year')::integer not between 2000 and 2100
    or jsonb_typeof(p_input->'ranks_enabled') is distinct from 'boolean'
    or jsonb_typeof(p_input->'sections') is distinct from 'array'
    or jsonb_array_length(p_input->'sections') < 1 then
    raise exception 'Check the paper details.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_input->'sections') s
    where coalesce(length(btrim(s->>'name')), 0) not between 1 and 60
      or jsonb_typeof(s->'questions') is distinct from 'array')
    or (select count(*) <> count(distinct btrim(s->>'name'))
      from jsonb_array_elements(p_input->'sections') s) then
    raise exception 'Give every section a unique name.';
  end if;
  -- Canonical contiguous positions; choice numbers are local to a section in the form.
  select coalesce(jsonb_agg(jsonb_build_object('position', n, 'question_id', q->>'question_id',
    'section', btrim(s->>'name'), 'choice_group', case when q->>'choice_group' is null then null
      else si::text || ':' || (q->>'choice_group') end) order by n), '[]') into v_rows
  from (select s, si, q, row_number() over (order by si, qi) n
    from jsonb_array_elements(p_input->'sections') with ordinality sections(s, si)
    cross join lateral jsonb_array_elements(s->'questions') with ordinality questions(q, qi)) ordered;
  if jsonb_array_length(v_rows) > 32767 or
    (select count(*) <> count(distinct r->>'question_id') from jsonb_array_elements(v_rows) r) then
    raise exception 'Use each question once.';
  end if;
  v_locked := v_paper.status <> 'draft' and exists (select 1 from public.sessions where paper_id = p_id);
  if v_locked then
    select coalesce(jsonb_agg(jsonb_build_object('position', pq.position, 'question_id', pq.question_id,
      'section', pq.section, 'choice_group', pq.choice_group) order by pq.position), '[]') into v_rows
    from public.paper_questions pq where pq.paper_id = p_id;
  end if;
  perform q.id from public.questions q
    where q.id in (select r->>'question_id' from jsonb_array_elements(v_rows) r)
    order by q.id for update;
  if exists (select 1 from jsonb_array_elements(v_rows) r
    left join public.questions q on q.id = r->>'question_id' where q.id is null) then
    raise exception 'A question no longer exists.';
  end if;
  if v_locked then
    v_total := v_paper.total_marks;
  else
    select coalesce(sum(marks), 0) into v_total from (
      select distinct on (coalesce(r->>'choice_group', 'q:' || (r->>'position')))
        q.marks from jsonb_array_elements(v_rows) r join public.questions q on q.id = r->>'question_id'
      order by coalesce(r->>'choice_group', 'q:' || (r->>'position')), (r->>'position')::integer
    ) counted;
    if v_total > 32767 then raise exception 'Too many marks.'; end if;
  end if;
  if p_status = 'live' and (not v_locked or v_paper.status <> 'live') then
    if jsonb_array_length(v_rows) = 0 then raise exception 'Add at least one question.'; end if;
    if exists (select 1 from (select (r->>'position')::integer as position,
      row_number() over (order by (r->>'position')::integer) as expected
      from jsonb_array_elements(v_rows) r) ordered where position <> expected) then
      raise exception 'Positions must be contiguous.';
    end if;
    if exists (select 1 from jsonb_array_elements(v_rows) r join public.questions q on q.id = r->>'question_id'
      where q.status = 'retired') then raise exception 'Retired questions cannot be published.'; end if;
    if exists (select 1 from jsonb_array_elements(v_rows) r join public.questions q on q.id = r->>'question_id'
      where r->>'choice_group' is not null group by r->>'choice_group'
      having count(*) < 2 or min(q.marks) <> max(q.marks) or count(distinct r->>'section') <> 1) then
      raise exception 'Choice groups need two or more questions with equal marks.';
    end if;
    if exists (select 1 from jsonb_array_elements(v_rows) r join public.questions q on q.id = r->>'question_id'
      where q.status = 'draft') and not coalesce(p_publish_drafts, false) then
      raise exception 'Publish the draft questions too.';
    end if;
    update public.questions set status = 'live', updated_at = clock_timestamp()
      where status = 'draft' and id in (select r->>'question_id' from jsonb_array_elements(v_rows) r);
  end if;
  if not v_locked then
    delete from public.paper_questions where paper_id = p_id;
    insert into public.paper_questions (paper_id, position, question_id, section, choice_group)
    select p_id, (r->>'position')::smallint, r->>'question_id', r->>'section',
      case when r->>'choice_group' is null then null else dense_rank() over (order by r->>'choice_group') end
    from jsonb_array_elements(v_rows) r;
  end if;
  v_version := clock_timestamp();
  update public.papers set title = btrim(p_input->>'title'), year = case when v_locked then v_paper.year else (p_input->>'year')::smallint end,
    source = case when v_locked then v_paper.source else nullif(btrim(p_input->>'source'), '') end, ranks_enabled = (p_input->>'ranks_enabled')::boolean,
    status = p_status, updated_at = v_version, total_marks = greatest(v_total, 1),
    time_limit_min = case when v_locked then v_paper.time_limit_min else (p_input->>'time_limit_min')::smallint end,
    section_names = case when v_locked then v_paper.section_names else
      (select jsonb_agg(btrim(s->>'name') order by i) from jsonb_array_elements(p_input->'sections') with ordinality sections(s, i)) end
    where id = p_id;
  return jsonb_build_object('total', v_total, 'version', v_version, 'previous_status', v_paper.status);
end;
$$;
revoke all on function public.admin_save_paper(uuid, jsonb, text, boolean, timestamptz) from public, anon;
grant execute on function public.admin_save_paper(uuid, jsonb, text, boolean, timestamptz) to authenticated;

-- Serialize a student start with a builder save before snapshotting the structure.
create or replace function public.start_paper(p_paper uuid, p_reading boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_paper public.papers;
  v_session uuid;
begin
  if v_user is null then raise exception 'sign in first'; end if;
  select * into v_paper from public.papers where id = p_paper and status = 'live' for share;
  if not found then raise exception 'paper not found'; end if;
  insert into public.sessions (user_id, kind, paper_id, config)
  values (v_user, 'paper', p_paper, jsonb_build_object(
    'time_limit_min', v_paper.time_limit_min,
    'reading_min', case when p_reading then 5 else 0 end,
    'strict', true,
    'sections', (select coalesce(jsonb_agg(jsonb_build_object('position', position, 'section', section,
      'choice_group', choice_group) order by position), '[]') from public.paper_questions where paper_id = p_paper)))
  returning id into v_session;
  insert into public.attempts (session_id, user_id, question_id, position)
  select v_session, v_user, question_id, position from public.paper_questions where paper_id = p_paper;
  return v_session;
end;
$$;
revoke execute on function public.start_paper(uuid, boolean) from public, anon;
grant execute on function public.start_paper(uuid, boolean) to authenticated;

-- Bulk retire is atomic and takes the same row locks as the builder.
create function public.admin_retire_papers(p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_previous jsonb;
  v_version timestamptz;
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_ids), 0) not between 1 and 50 then
    raise exception 'Select between 1 and 50 papers.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'status', status)), '[]') into v_previous
    from (select id, status from public.papers where id = any(p_ids) and status <> 'retired'
      order by id for update) locked;
  v_version := clock_timestamp();
  update public.papers set status = 'retired', updated_at = v_version
    where id = any(p_ids) and status <> 'retired';
  return jsonb_build_object('previous', v_previous, 'version', v_version);
end;
$$;
revoke all on function public.admin_retire_papers(uuid[]) from public, anon;
grant execute on function public.admin_retire_papers(uuid[]) to authenticated;
