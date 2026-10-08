-- Content provenance, admin editing and dedupe for questions and flashcards; students' own flashcards.
create extension if not exists pg_trgm with schema extensions;

-- Normalised text for dedupe keys: lower case, punctuation and runs of space collapsed.
create function public.dedupe_norm(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select btrim(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', ' ', 'g'))
$$;

alter table public.questions
  add column origin text not null default 'nesa' check (origin in ('nesa', 'a1', 'claro')),
  add column origin_ref text,
  add column explanation text,
  add column verb text,
  add column status text not null default 'live' check (status in ('draft', 'live', 'retired')),
  add column dedupe_key text not null generated always as (md5(
    type || '|' || public.dedupe_norm(stem) || '|' || public.dedupe_norm(options[1]) || '|' ||
    public.dedupe_norm(options[2]) || '|' || public.dedupe_norm(options[3]) || '|' || public.dedupe_norm(options[4])
  )) stored,
  add column duplicate_of text references public.questions,
  add column updated_at timestamptz not null default now();
create unique index on public.questions (origin, origin_ref) where origin_ref is not null;
create unique index questions_dedupe_live on public.questions (dedupe_key) where status <> 'retired';
create index on public.questions (status, type, topic_id);
create index questions_stem_trgm on public.questions using gin (stem extensions.gin_trgm_ops);

drop policy "signed-in read" on public.questions;
create policy "live or admin read" on public.questions for select to authenticated
  using (status = 'live' or (select public.is_admin()));
create policy "admin insert" on public.questions for insert to authenticated
  with check ((select public.is_admin()));
create policy "admin update" on public.questions for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- Keys stay server-side: students keep the safe column list; admins write through RLS.
grant select (verb, status) on public.questions to authenticated;
grant insert, update on public.questions to authenticated;

alter table public.flashcards
  alter column id set default gen_random_uuid()::text,
  add column owner_id uuid references public.profiles on delete cascade,
  add column origin text not null default 'claro' check (origin in ('a1', 'claro', 'student')),
  add column origin_ref text,
  add column status text not null default 'live' check (status in ('draft', 'live', 'retired')),
  add column dedupe_key text not null generated always as (md5(public.dedupe_norm(front))) stored,
  add column updated_at timestamptz not null default now(),
  add check ((owner_id is null) = (origin <> 'student'));
create unique index flashcards_shared_dedupe on public.flashcards (kind, dedupe_key) where owner_id is null;
create index on public.flashcards (owner_id) where owner_id is not null;

drop policy "signed-in read" on public.flashcards;
create policy "shared live, own or admin read" on public.flashcards for select to authenticated
  using ((owner_id is null and status = 'live') or owner_id = (select auth.uid()) or (select public.is_admin()));
create policy "own or admin insert" on public.flashcards for insert to authenticated
  with check ((owner_id = (select auth.uid()) and origin = 'student') or (select public.is_admin()));
create policy "own or admin update" on public.flashcards for update to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()))
  with check ((owner_id = (select auth.uid()) and origin = 'student') or (select public.is_admin()));
create policy "own or admin delete" on public.flashcards for delete to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));
grant insert, update, delete on public.flashcards to authenticated;

alter table public.flashcard_reviews
  add column answer_mode text check (answer_mode in ('typed', 'spoken')),
  drop constraint flashcard_reviews_flashcard_id_fkey,
  add constraint flashcard_reviews_flashcard_id_fkey foreign key (flashcard_id) references public.flashcards on delete cascade;
grant insert (answer_mode) on public.flashcard_reviews to authenticated;
-- start_sprint gains the live-only filter in 0016, where it is rebuilt around a config object.
