-- Blind second-pass check and the admin review queue. feedback jsonb shape stays unconstrained (owned by claro-ml).
alter table public.attempts
  add column marked_by_model text,
  add column check_status text not null default 'skipped'
    check (check_status in ('skipped', 'pending', 'agreed', 'second_pass', 'in_review', 'reviewed'));
-- Legacy marks: written ones were never checked (model unknown); MCQ is deterministic.
update public.attempts a set marked_by_model = 'deterministic'
from public.questions q
where q.id = a.question_id and q.type = 'mcq' and a.status = 'marked';

alter table public.attempts drop constraint attempts_status_check;
alter table public.attempts add constraint attempts_status_check
  check (status in ('pending', 'transcribed', 'marking', 'marked', 'skipped', 'failed', 'unreadable'));

-- Several photo pages per answer (extended responses, papers).
alter table public.attempts add column image_paths text[] check (cardinality(image_paths) between 1 and 8);
update public.attempts set image_paths = array[image_path] where image_path is not null;
alter table public.attempts drop column image_path;
grant insert (image_paths), update (image_paths) on public.attempts to authenticated;

create table public.mark_reviews (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  reason text not null check (reason in ('check_disagreed', 'student_dispute', 'spot_check')),
  ai_mark numeric,
  ai_model text,
  check_mark numeric,
  check_model text,
  check_notes text,
  student_note text check (char_length(student_note) between 10 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  final_mark numeric,
  admin_note text,
  resolved_by uuid references public.profiles on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'resolved') = (resolved_at is not null))
);
create unique index mark_reviews_one_open on public.mark_reviews (attempt_id) where status = 'open';
create index on public.mark_reviews (user_id, created_at desc);
create index on public.mark_reviews (created_at) where status = 'open';

-- Disputes go through a server route (it also sets check_status), so students only read.
alter table public.mark_reviews enable row level security;
create policy "own or admin read" on public.mark_reviews for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "admin update" on public.mark_reviews for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.mark_reviews from anon, authenticated;
grant select on public.mark_reviews to authenticated;
grant update (status, final_mark, admin_note, resolved_by, resolved_at) on public.mark_reviews to authenticated;

create view public.review_queue with (security_invoker = true) as
select r.id, r.attempt_id, r.user_id, r.reason, r.ai_mark, r.ai_model, r.check_mark, r.check_model,
  r.check_notes, r.student_note, r.created_at,
  a.session_id, a.question_id, a.answer_text, a.transcript, a.image_paths, a.mark, a.max_marks, a.band,
  a.feedback, a.status as attempt_status, q.type, q.source, q.stem
from public.mark_reviews r
join public.attempts a on a.id = r.attempt_id
left join public.questions q on q.id = a.question_id
where r.status = 'open' and (select public.is_admin())
order by r.created_at;
revoke all on public.review_queue from anon;
grant select on public.review_queue to authenticated;
