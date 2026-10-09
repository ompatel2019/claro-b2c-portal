-- Share import-review pairs through the server cache without request-bound admin auth.
-- The service RPC is service-role only; the existing authenticated RPC retains its admin check.
CREATE FUNCTION public.question_import_review(p_threshold double precision DEFAULT 0.82, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(id text, draft jsonb, "row" jsonb, score double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_threshold is null or p_threshold < 0.60 or p_threshold > 0.99 then
    raise exception 'invalid threshold';
  end if;
  perform set_config('pg_trgm.similarity_threshold', p_threshold::text, true);
  return query
    select d.id,
      jsonb_build_object('id', d.id, 'stem', d.stem, 'source', d.source, 'status', d.status),
      jsonb_build_object('id', m.id, 'stem', m.stem, 'source', m.source, 'status', m.status),
      m.score::double precision
    from public.questions d
    cross join lateral (
      select c.* from (
        select q.*, extensions.similarity(d.stem, q.stem) as score
        from public.questions q where q.id = d.duplicate_of and q.id <> d.id
        union all
        -- % uses the questions_stem_trgm GIN index (threshold set above) instead of scoring every row
        select q.*, extensions.similarity(d.stem, q.stem) as score
        from public.questions q where d.duplicate_of is null and q.id <> d.id and q.status <> 'retired'
          and q.stem operator(extensions.%) d.stem
      ) c where c.id = d.duplicate_of or c.score >= p_threshold
      order by c.score desc, c.id limit 1
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
$function$

;

revoke all on function public.question_import_review(double precision, jsonb) from public, anon, authenticated;
grant execute on function public.question_import_review(double precision, jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.admin_import_review(p_threshold double precision DEFAULT 0.82, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(id text, draft jsonb, "row" jsonb, score double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (select public.is_admin()) then raise exception 'admin only'; end if;
  return query select * from public.question_import_review(p_threshold, p_filters);
end;
$function$;

revoke execute on function public.admin_import_review(double precision, jsonb) from public, anon;
grant execute on function public.admin_import_review(double precision, jsonb) to authenticated;
