-- Claro core schema: profiles/roles, syllabus, content, sessions, attempts, flashcard reviews, AI usage, answer photos.
-- Marks, feedback and answer keys are written/read only by server code (service role); students write answers only.


create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role text not null default 'student' check (role in ('student', 'admin')),
  year_level smallint check (year_level in (11, 12)),
  school text,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
$$;

create table public.topics (
  id text primary key,
  parent_id text references public.topics,
  name text not null,
  sort smallint not null
);

create table public.questions (
  id text primary key,                      -- e.g. 2024-q21b
  type text not null check (type in ('mcq', 'short', 'extended')),
  topic_id text not null references public.topics,
  marks smallint not null check (marks > 0),
  stem text not null,
  stimulus text,
  options text[] check (options is null or cardinality(options) = 4),
  correct_index smallint check (correct_index between 0 and 3),
  criteria jsonb,                           -- [{min, max, descriptor}] highest band first
  guideline_notes text,                     -- "answers could include" etc.
  sample_answer text,
  source text not null,                     -- e.g. 2024 HSC Q21(b)
  year smallint not null,
  created_at timestamptz not null default now(),
  check ((type = 'mcq') = (options is not null and correct_index is not null)),
  check (type = 'mcq' or criteria is not null)
);
create index on public.questions (topic_id, type);

create table public.flashcards (
  id text primary key,
  topic_id text not null references public.topics,
  kind text not null check (kind in ('term', 'stat')),
  front text not null,
  back text not null,
  created_at timestamptz not null default now()
);
create index on public.flashcards (topic_id);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  kind text not null check (kind in ('sprint', 'flashcards')),
  config jsonb not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score numeric,
  max_score numeric,
  summary jsonb                             -- {strengths[], improvements[], next_steps[]}
);
create index on public.sessions (user_id, started_at desc);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  question_id text not null references public.questions,
  position smallint not null,
  choice_index smallint check (choice_index between 0 and 3),
  answer_text text,
  image_path text,
  transcript text,
  status text not null default 'pending' check (status in ('pending', 'transcribed', 'marking', 'marked', 'failed')),
  mark numeric,
  max_marks smallint,
  band text,
  feedback jsonb,
  marked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, question_id)
);
create index on public.attempts (user_id, created_at desc);

create table public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  session_id uuid references public.sessions on delete cascade,
  flashcard_id text not null references public.flashcards,
  answer text,
  mark numeric not null check (mark in (0, 0.5, 1)),
  source text not null check (source in ('self', 'ai')),
  reason text,
  created_at timestamptz not null default now()
);
create index on public.flashcard_reviews (user_id, created_at desc);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users on delete set null,
  task text not null,
  model text not null,
  input_tokens integer not null,
  cached_tokens integer not null default 0,
  output_tokens integer not null,
  usd numeric(12, 6) not null
);

-- RLS
alter table public.profiles enable row level security;
alter table public.topics enable row level security;
alter table public.questions enable row level security;
alter table public.flashcards enable row level security;
alter table public.sessions enable row level security;
alter table public.attempts enable row level security;
alter table public.flashcard_reviews enable row level security;
alter table public.ai_usage enable row level security;

create policy "own or admin read" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "own update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "signed-in read" on public.topics for select to authenticated using (true);
create policy "signed-in read" on public.questions for select to authenticated using (true);
create policy "signed-in read" on public.flashcards for select to authenticated using (true);

create policy "own or admin read" on public.sessions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "own insert" on public.sessions for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "own or admin read" on public.attempts for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "own insert" on public.attempts for insert to authenticated
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.sessions s where s.id = session_id and s.user_id = (select auth.uid()) and s.finished_at is null));
create policy "own update before marking" on public.attempts for update to authenticated
  using (user_id = (select auth.uid()) and status in ('pending', 'transcribed'))
  with check (user_id = (select auth.uid()) and status in ('pending', 'transcribed'));

create policy "own or admin read" on public.flashcard_reviews for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "own self-rated insert" on public.flashcard_reviews for insert to authenticated
  with check (user_id = (select auth.uid()) and source = 'self');

create policy "admin read" on public.ai_usage for select to authenticated using ((select public.is_admin()));

-- Grants: column-level so answer keys stay server-side and students cannot write marks, roles or feedback.
revoke all on public.profiles, public.topics, public.questions, public.flashcards, public.sessions,
  public.attempts, public.flashcard_reviews, public.ai_usage from anon, authenticated;
grant select on public.profiles, public.topics, public.flashcards, public.sessions, public.attempts,
  public.flashcard_reviews, public.ai_usage to authenticated;
grant update (full_name, year_level, school) on public.profiles to authenticated;
grant select (id, type, topic_id, marks, stem, stimulus, options, source, year) on public.questions to authenticated;
grant insert (kind, config) on public.sessions to authenticated;
grant insert (session_id, question_id, position, choice_index, answer_text, image_path) on public.attempts to authenticated;
grant update (choice_index, answer_text, image_path, transcript) on public.attempts to authenticated;
grant insert (session_id, flashcard_id, answer, mark, source) on public.flashcard_reviews to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Answer photos: private bucket, objects stored under <user id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('answers', 'answers', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

create policy "answers own read" on storage.objects for select to authenticated
  using (bucket_id = 'answers' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
create policy "answers own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'answers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "answers own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'answers' and (storage.foldername(name))[1] = (select auth.uid())::text);
