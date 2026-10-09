-- Single checks are reserved by the server (service role, including the daily
-- cap). Additive only: restrictive policies narrow the existing permissive
-- "own insert" / "own update before marking" policies without replacing them.
create policy "no direct single sessions" on public.sessions
  as restrictive for insert to authenticated
  with check (kind <> 'single');

create policy "no direct single attempts" on public.attempts
  as restrictive for insert to authenticated
  with check (not exists (select 1 from public.sessions s
    where s.id = session_id and s.kind = 'single'));

-- A submitted single answer is immutable, even while pending or failed.
create policy "submitted single answers are locked" on public.attempts
  as restrictive for update to authenticated
  using (not exists (select 1 from public.sessions s
    where s.id = session_id and s.kind = 'single' and s.finished_at is not null))
  with check (not exists (select 1 from public.sessions s
    where s.id = session_id and s.kind = 'single' and s.finished_at is not null));
