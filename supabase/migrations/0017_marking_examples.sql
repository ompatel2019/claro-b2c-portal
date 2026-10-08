-- Anonymised marked answers for the grader (split 'example') and the held-out eval (split 'test').
-- No personal data: no link to profiles, auth users, sessions or attempts. Server-only writes.
create table public.marking_examples (
  id uuid primary key default gen_random_uuid(),
  question_id text not null references public.questions,
  answer_text text not null,
  tutor_mark numeric not null,
  band text,
  accepted_tutor_comments jsonb not null default '[]' check (jsonb_typeof(accepted_tutor_comments) = 'array'),
  rejected_ai_comments jsonb not null default '[]' check (jsonb_typeof(rejected_ai_comments) = 'array'),
  split text not null check (split in ('example', 'test')),
  origin text not null check (origin in ('a1', 'admin_override')),
  source_hash text not null unique,
  created_at timestamptz not null default now(),
  check (origin = 'a1' or split = 'example')
);
create index on public.marking_examples (question_id, split);

create function public.marking_examples_split_fixed() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.split is distinct from old.split then raise exception 'split is fixed at import'; end if;
  return new;
end $$;
revoke execute on function public.marking_examples_split_fixed() from public, anon, authenticated;
create trigger marking_examples_split_fixed before update on public.marking_examples
  for each row execute function public.marking_examples_split_fixed();

alter table public.marking_examples enable row level security;
create policy "admin read" on public.marking_examples for select to authenticated
  using ((select public.is_admin()));
revoke all on public.marking_examples from anon, authenticated;
grant select on public.marking_examples to authenticated;

-- The grader reads examples only through this view, so test rows never reach a prompt.
create view public.marking_examples_for_grader as
select id, question_id, answer_text, tutor_mark, band, accepted_tutor_comments, rejected_ai_comments
from public.marking_examples
where split = 'example';
revoke all on public.marking_examples_for_grader from anon, authenticated;
grant select on public.marking_examples_for_grader to service_role;
