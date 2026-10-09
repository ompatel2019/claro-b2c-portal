-- Preview a DRAFT paper as listed accounts only (e.g. the QA test student) without
-- publishing it. Additive: a new column, two extra permissive read policies (the
-- existing "live or admin read" policies are untouched) and start_paper also
-- accepting a draft the caller is listed on. Real students never see a draft paper
-- unless an admin lists their id. The paper's questions must be live bank questions.
alter table public.papers
  add column if not exists preview_user_ids uuid[] not null default '{}';

create policy "listed draft read" on public.papers for select to authenticated
  using (status = 'draft' and (select auth.uid()) = any (preview_user_ids));

create policy "listed draft read" on public.paper_questions for select to authenticated
  using (exists (select 1 from public.papers p where p.id = paper_questions.paper_id
    and p.status = 'draft' and (select auth.uid()) = any (p.preview_user_ids)));

-- Same as 0032 (structure lock) plus listed drafts.
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
  select * into v_paper from public.papers where id = p_paper
    and (status = 'live' or (status = 'draft' and v_user = any (preview_user_ids))) for share;
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
