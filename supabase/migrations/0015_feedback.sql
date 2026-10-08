-- Student feedback and bug reports (one table with a kind), plus private screenshots.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  kind text not null default 'general' check (kind in ('general', 'bug', 'content', 'marking', 'feature')),
  message text not null check (char_length(message) between 3 and 4000),
  page_path text check (char_length(page_path) <= 500),
  user_agent text check (char_length(user_agent) <= 500),
  screenshots text[] not null default '{}' check (cardinality(screenshots) <= 5),
  question_id text references public.questions on delete set null,
  flashcard_id text references public.flashcards on delete set null,
  session_id uuid references public.sessions on delete set null,
  status text not null default 'new' check (status in ('new', 'triaged', 'resolved')),
  admin_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.feedback (user_id, created_at desc);
create index on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;
create policy "own or admin read" on public.feedback for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "own insert" on public.feedback for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'new'
    and not exists (select 1 from unnest(screenshots) as path where path not like (select auth.uid())::text || '/%'));
create policy "admin update" on public.feedback for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.feedback from anon, authenticated;
grant select on public.feedback to authenticated;
grant insert (kind, message, page_path, user_agent, screenshots, question_id, flashcard_id, session_id)
  on public.feedback to authenticated;
grant update (status, admin_note, resolved_at) on public.feedback to authenticated;

-- Screenshots: private bucket, objects under <user id>/..., like 'answers'.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 5242880, array['image/png', 'image/jpeg', 'image/webp']);
create policy "reports own read" on storage.objects for select to authenticated
  using (bucket_id = 'reports' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
create policy "reports own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'reports' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "reports own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = (select auth.uid())::text);
