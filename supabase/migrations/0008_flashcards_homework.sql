-- Phase 2b: spaced-repetition progress per student and card, and starting a homework session in one call.
create table public.flashcard_progress (
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  flashcard_id text not null references public.flashcards on delete cascade,
  interval_days smallint not null check (interval_days between 0 and 365),
  due_on date not null,
  last_mark numeric not null check (last_mark in (0, 0.5, 1)),
  reviews integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, flashcard_id)
);
create index on public.flashcard_progress (user_id, due_on);
alter table public.flashcard_progress enable row level security;
create policy "own read" on public.flashcard_progress for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own insert" on public.flashcard_progress for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "own update" on public.flashcard_progress for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.flashcard_progress from anon, authenticated;
grant select, insert, update on public.flashcard_progress to authenticated;
grant all on public.flashcard_progress to service_role;

create index on public.flashcard_reviews (session_id, flashcard_id);

-- Creates (or returns) the student's session for a published set, with an attempt per question.
create or replace function public.start_homework(p_set uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session uuid;
begin
  select id into v_session from public.sessions
  where user_id = (select auth.uid()) and homework_set_id = p_set;
  if v_session is not null then return v_session; end if;
  if not exists (select 1 from public.homework_sets where id = p_set and published_at <= now()) then
    raise exception 'homework not found';
  end if;
  insert into public.sessions (kind, homework_set_id, config)
  values ('homework', p_set, '{}') returning id into v_session;
  insert into public.attempts (session_id, question_id, position)
  select v_session, question_id, row_number() over (order by position)
  from public.homework_items where set_id = p_set and question_id is not null;
  return v_session;
end;
$$;
revoke execute on function public.start_homework(uuid) from public, anon;
grant execute on function public.start_homework(uuid) to authenticated;
