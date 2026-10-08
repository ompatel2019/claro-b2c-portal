-- Weekly homework: an admin-built set of flashcards then questions, due by a date.
-- A student's run through a set is a session (kind 'homework'); its answers are attempts and flashcard_reviews.
create table public.homework_sets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  topic_id text references public.topics,
  due_at timestamptz not null,
  published_at timestamptz,
  created_by uuid default auth.uid() references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

create table public.homework_items (
  set_id uuid not null references public.homework_sets on delete cascade,
  position smallint not null,
  flashcard_id text references public.flashcards,
  question_id text references public.questions,
  primary key (set_id, position),
  check ((flashcard_id is null) <> (question_id is null))
);

alter table public.sessions drop constraint sessions_kind_check;
alter table public.sessions add constraint sessions_kind_check check (kind in ('sprint', 'flashcards', 'homework'));
alter table public.sessions add column homework_set_id uuid references public.homework_sets on delete cascade;
alter table public.sessions add constraint sessions_homework_check check ((kind = 'homework') = (homework_set_id is not null));
create unique index on public.sessions (user_id, homework_set_id) where homework_set_id is not null;

alter table public.homework_sets enable row level security;
alter table public.homework_items enable row level security;

create policy "published or admin read" on public.homework_sets for select to authenticated
  using (published_at <= now() or (select public.is_admin()));
create policy "admin write" on public.homework_sets for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "published or admin read" on public.homework_items for select to authenticated
  using (exists (select 1 from public.homework_sets s where s.id = set_id and (s.published_at <= now() or (select public.is_admin()))));
create policy "admin write" on public.homework_items for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.homework_sets, public.homework_items from anon, authenticated;
grant select, insert, update, delete on public.homework_sets, public.homework_items to authenticated;
grant insert (homework_set_id) on public.sessions to authenticated;

-- Total AI spend, for the budget guard (service role only).
create function public.ai_spend() returns numeric
language sql stable set search_path = '' as $$ select coalesce(sum(usd), 0) from public.ai_usage $$;
revoke execute on function public.ai_spend() from public, anon, authenticated;
