-- Full timed mock papers: an ordered list of bank questions, sat online as a 'paper' session.
create table public.papers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  year smallint,
  origin text not null default 'claro' check (origin in ('nesa', 'a1', 'claro')),
  source text,
  time_limit_min smallint not null default 180 check (time_limit_min > 0),
  total_marks smallint not null default 100 check (total_marks > 0),
  status text not null default 'draft' check (status in ('draft', 'live', 'retired')),
  ranks_enabled boolean not null default false,
  sort smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.paper_questions (
  paper_id uuid not null references public.papers on delete cascade,
  position smallint not null check (position > 0),
  question_id text not null references public.questions,
  section text,
  choice_group smallint,
  primary key (paper_id, position),
  unique (paper_id, question_id)
);
create index on public.paper_questions (question_id);

alter table public.papers enable row level security;
alter table public.paper_questions enable row level security;
create policy "live or admin read" on public.papers for select to authenticated
  using (status = 'live' or (select public.is_admin()));
create policy "admin write" on public.papers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "live or admin read" on public.paper_questions for select to authenticated
  using (exists (select 1 from public.papers p where p.id = paper_id and (p.status = 'live' or (select public.is_admin()))));
create policy "admin write" on public.paper_questions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.papers, public.paper_questions from anon, authenticated;
grant select, insert, update, delete on public.papers, public.paper_questions to authenticated;

alter table public.sessions add column paper_id uuid references public.papers;
alter table public.sessions drop constraint sessions_kind_check;
alter table public.sessions add constraint sessions_kind_check check (kind in ('sprint', 'flashcards', 'paper'));
alter table public.sessions add constraint sessions_paper_check check ((kind = 'paper') = (paper_id is not null));
create index on public.sessions (paper_id, user_id) where paper_id is not null;

-- 'skipped' = the unanswered side of a paper choice group; left out of max_score.
alter table public.attempts drop constraint attempts_status_check;
alter table public.attempts add constraint attempts_status_check
  check (status in ('pending', 'transcribed', 'marking', 'marked', 'skipped', 'failed'));

-- Starts a sit of a live paper. Config is copied so later paper edits never move a running clock.
create function public.start_paper(p_paper uuid, p_reading boolean default true)
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
  select * into v_paper from public.papers where id = p_paper and status = 'live';
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

-- Caller's percentile among students' first finished sit. Nothing unless ranks are on and >= 20 first sits.
create function public.paper_rank(p_paper uuid)
returns table (percentile integer, cohort integer)
language sql
stable
security definer
set search_path = ''
as $$
  with firsts as (
    select distinct on (user_id) user_id, score / nullif(max_score, 0) as pct
    from public.sessions
    where paper_id = p_paper and finished_at is not null
    order by user_id, finished_at
  ), mine as (
    select pct from firsts where user_id = (select auth.uid())
  )
  select round(100.0 * (select count(*) from firsts f where f.pct < m.pct) / count_all)::integer,
    count_all::integer
  from mine m, (select count(*) as count_all from firsts) c
  where c.count_all >= 20
    and exists (select 1 from public.papers where id = p_paper and ranks_enabled);
$$;
revoke execute on function public.paper_rank(uuid) from public, anon;
grant execute on function public.paper_rank(uuid) to authenticated;
