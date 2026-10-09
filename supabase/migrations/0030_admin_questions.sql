-- §4.4 admin questions: import review, question stats, test-mark reservations, editor saves. Applied via the Management API.
create function public.admin_import_review(p_threshold double precision default 0.82, p_filters jsonb default '{}'::jsonb)
returns table(id text, draft jsonb, "row" jsonb, score double precision)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'admin only'; end if;
  if p_threshold is null or p_threshold < 0.60 or p_threshold > 0.99 then
    raise exception 'invalid threshold';
  end if;
  return query
    select d.id,
      jsonb_build_object('id', d.id, 'stem', d.stem, 'source', d.source, 'status', d.status),
      jsonb_build_object('id', m.id, 'stem', m.stem, 'source', m.source, 'status', m.status),
      m.score::double precision
    from public.questions d
    cross join lateral (
      select q.*, extensions.similarity(d.stem, q.stem) as score
      from public.questions q where q.id <> d.id and (
        q.id = d.duplicate_of or (d.duplicate_of is null and q.status <> 'retired'
          and extensions.similarity(d.stem, q.stem) >= p_threshold))
      order by extensions.similarity(d.stem, q.stem) desc, q.id limit 1
    ) m where d.status = 'draft'
      and (coalesce(p_filters->>'q', '') = '' or strpos(lower(concat_ws(' ', d.id, d.source, d.stem, m.id, m.source, m.stem)), lower(p_filters->>'q')) > 0)
      and (coalesce(p_filters->>'type', '') = '' or d.type = p_filters->>'type')
      and (coalesce(p_filters->>'topic', '') = '' or d.topic_id = p_filters->>'topic' or exists (
        select 1 from public.topics t where t.id = d.topic_id and t.parent_id = p_filters->>'topic'))
      and (coalesce(p_filters->>'from', '') !~ '^[0-9]{4}$' or d.year >= case when p_filters->>'from' ~ '^[0-9]{4}$' then (p_filters->>'from')::int end)
      and (coalesce(p_filters->>'to', '') !~ '^[0-9]{4}$' or d.year <= case when p_filters->>'to' ~ '^[0-9]{4}$' then (p_filters->>'to')::int end)
      and (coalesce(p_filters->>'origin', '') = '' or d.origin = p_filters->>'origin')
      and (coalesce(p_filters->>'verb', '') = '' or d.verb = p_filters->>'verb')
      and (coalesce(p_filters->>'marks', '') !~ '^[0-9]{1,2}$' or d.marks = case when p_filters->>'marks' ~ '^[0-9]{1,2}$' then (p_filters->>'marks')::int end)
      and (coalesce(p_filters->>'paper', '') not in ('yes','no') or exists (
        select 1 from public.paper_questions pq join public.papers p on p.id=pq.paper_id
        where pq.question_id=d.id and p.status='live') = (p_filters->>'paper' = 'yes'))
      and case p_filters->>'missing'
        when 'explanation' then d.type='mcq' and nullif(btrim(d.explanation), '') is null
        when 'sample' then d.type <> 'mcq' and nullif(btrim(d.sample_answer), '') is null
        when 'criteria' then d.type <> 'mcq' and (d.criteria is null or d.criteria='[]'::jsonb)
        when 'stimulus' then nullif(btrim(d.stimulus), '') is not null
        else true end;
end;
$$;
revoke execute on function public.admin_import_review(double precision, jsonb) from public, anon;
grant execute on function public.admin_import_review(double precision, jsonb) to authenticated;

-- One row per bank question. All counts include the complete underlying tables.
create function public.admin_question_stats(p_ids text[], p_detail boolean default false)
returns table(id text, attempts bigint, avg numeric, disagreements bigint, reports bigint,
  histogram jsonb, picks jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'admin only'; end if;
  return query
    select q.id, a.n, a.avg, a.disagreements,
      (select count(*) from public.feedback f where f.question_id = q.id and f.kind = 'content' and f.status <> 'resolved'),
      case when p_detail then (select jsonb_agg((select count(*) from public.attempts t where t.question_id = q.id
          and t.status = 'marked' and t.mark = bin) order by bin)
        from generate_series(0, q.marks) bin) else '[]'::jsonb end,
      jsonb_build_object('rates', picks.rates, 'picks', picks.n,
        'flagged', picks.n > 0 and q.correct_index is not null and
          (picks.rates->>q.correct_index)::numeric < 25 and exists (
            select 1 from jsonb_array_elements_text(picks.rates) with ordinality r(rate, pos)
            where pos <> q.correct_index + 1 and rate::numeric >= 50))
    from public.questions q
    cross join lateral (
      select count(*) n,
        round(100.0 * sum(t.mark) filter (where t.status = 'marked') /
          nullif(sum(t.max_marks) filter (where t.status = 'marked' and t.mark is not null), 0)) avg,
        count(*) filter (where t.check_status = 'second_pass' or exists (
          select 1 from public.mark_reviews r where r.attempt_id = t.id and r.reason = 'check_disagreed')) disagreements
      from public.attempts t where t.question_id = q.id
    ) a
    cross join lateral (
      select count(*) n, jsonb_build_array(
        coalesce(round(100.0 * count(*) filter (where t.choice_index = 0) / nullif(count(*), 0)), 0),
        coalesce(round(100.0 * count(*) filter (where t.choice_index = 1) / nullif(count(*), 0)), 0),
        coalesce(round(100.0 * count(*) filter (where t.choice_index = 2) / nullif(count(*), 0)), 0),
        coalesce(round(100.0 * count(*) filter (where t.choice_index = 3) / nullif(count(*), 0)), 0)) rates
      from public.attempts t where t.question_id = q.id and t.status = 'marked' and t.choice_index is not null and p_detail
    ) picks where q.id = any(p_ids);
end;
$$;
revoke execute on function public.admin_question_stats(text[], boolean) from public, anon;
grant execute on function public.admin_question_stats(text[], boolean) to authenticated;

-- Concurrent Test mark requests reserve a slot before calling AI, even on failure.
-- Zero-cost reservations are recorded separately from real engine calls.
create function public.admin_reserve_test_mark() returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if not (select public.is_admin()) then raise exception 'admin only'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':admin_test', 0));
  if exists(select 1 from public.ai_usage where user_id=auth.uid() and task='admin_test_request'
      and model='request' and created_at >= now() - interval '4 minutes') then return null; end if;
  if (select count(*) from public.ai_usage where user_id = auth.uid() and task = 'admin_test_request'
      and created_at >= now() - interval '1 minute') >= 5
    or (select count(*) from public.ai_usage where user_id = auth.uid() and task = 'admin_test_request'
      and created_at >= now() - interval '1 hour') >= 30 then return null; end if;
  insert into public.ai_usage(user_id, task, model, input_tokens, output_tokens, usd)
    values(auth.uid(), 'admin_test_request', 'request', 0, 0, 0) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.admin_reserve_test_mark() from public, anon;
grant execute on function public.admin_reserve_test_mark() to authenticated;

-- Editor stimulus assets are public; only admins can write them.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('question-images', 'question-images', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "question images admin insert" on storage.objects for insert to authenticated
with check (bucket_id = 'question-images' and (select public.is_admin()));
create policy "question images admin delete" on storage.objects for delete to authenticated
using (bucket_id = 'question-images' and (select public.is_admin()));

-- A row lock serialises saves/deletes with new attempt FK checks.
create function public.admin_save_question(p_row jsonb, p_expected timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old public.questions;
  v_new public.questions;
  v_time timestamptz := clock_timestamp();
begin
  if not (select public.is_admin()) then raise exception 'admin only'; end if;
  v_new := jsonb_populate_record(null::public.questions, p_row);
  if not exists (select 1 from public.topics where id = v_new.topic_id and parent_id is not null) then
    return jsonb_build_object('error', 'Choose a subtopic.'); end if;
  if p_expected is null then
    insert into public.questions(id,type,topic_id,marks,verb,source,year,stem,stimulus,options,
      correct_index,explanation,criteria,guideline_notes,sample_answer,status,origin,updated_at)
    values(v_new.id,v_new.type,v_new.topic_id,v_new.marks,v_new.verb,v_new.source,v_new.year,v_new.stem,
      v_new.stimulus,v_new.options,v_new.correct_index,v_new.explanation,v_new.criteria,
      v_new.guideline_notes,v_new.sample_answer,v_new.status,'claro',v_time);
  else
    select * into v_old from public.questions where id = v_new.id for update;
    if not found then return jsonb_build_object('error', 'This question no longer exists.'); end if;
    if v_old.updated_at <> p_expected then return jsonb_build_object('conflict', v_old.updated_at); end if;
    if (v_new.type <> v_old.type or v_new.marks <> v_old.marks) and
      exists (select 1 from public.attempts where question_id = v_old.id) then
      return jsonb_build_object('error', 'Has attempts. Type and marks are locked.'); end if;
    update public.questions set type=v_new.type,topic_id=v_new.topic_id,marks=v_new.marks,verb=v_new.verb,
      source=v_new.source,year=v_new.year,stem=v_new.stem,stimulus=v_new.stimulus,options=v_new.options,
      correct_index=v_new.correct_index,explanation=v_new.explanation,criteria=v_new.criteria,
      guideline_notes=v_new.guideline_notes,sample_answer=v_new.sample_answer,status=v_new.status,updated_at=v_time
    where id=v_new.id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_new.id, 'updated_at', v_time);
end;
$$;
revoke execute on function public.admin_save_question(jsonb, timestamptz) from public, anon;
grant execute on function public.admin_save_question(jsonb, timestamptz) to authenticated;

create function public.admin_delete_question(p_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if not (select public.is_admin()) then raise exception 'admin only'; end if;
  select status into v_status from public.questions where id=p_id for update;
  if not found or v_status <> 'draft' or exists(select 1 from public.attempts where question_id=p_id) then
    return false; end if;
  delete from public.questions where id=p_id;
  return true;
end;
$$;
revoke execute on function public.admin_delete_question(text) from public, anon;
grant execute on function public.admin_delete_question(text) to authenticated;
