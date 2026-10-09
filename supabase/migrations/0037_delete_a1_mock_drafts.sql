-- Papers are gone, so the 25 A1 mock-exam DRAFT questions (a1-x-*) go too.
-- Only unpublished rows nobody references are removed: the 41 retired a1-m* mock questions
-- (marking_examples references them) and every live or practice question are untouched, and
-- marking_examples is not read or changed. The block aborts (rolls back) if it would remove
-- anything other than the listed drafts.
do $$
declare
  removed int;
begin
  with gone as (
    delete from public.questions q
    where q.id in (
    'a1-x-0b8123f51776',
    'a1-x-27dc1793f6c0',
    'a1-x-2dc0747092d7',
    'a1-x-3c0c4162c4ed',
    'a1-x-5282446aff5a',
    'a1-x-5b6797ba3b0c',
    'a1-x-5e071afc4c0b',
    'a1-x-5fffa3705f45',
    'a1-x-67a4a561fcb1',
    'a1-x-68d44297cfef',
    'a1-x-69dfd76bdc65',
    'a1-x-78e84b5bf8b5',
    'a1-x-82a8b781f844',
    'a1-x-856884f3717f',
    'a1-x-8bd2d5ce5cd6',
    'a1-x-906764be982c',
    'a1-x-976196b796d9',
    'a1-x-b2d684f392ec',
    'a1-x-b439a01f7f5d',
    'a1-x-b61ff7291267',
    'a1-x-b6301ed285ca',
    'a1-x-bd70fbc96bde',
    'a1-x-dc26a4dc2471',
    'a1-x-f7f229ca32f4',
    'a1-x-ffc02f6b9184'
    )
      and q.origin = 'a1'
      and q.status = 'draft'
      and q.source like 'A1 HSC Mock%'
      and not exists (select 1 from public.marking_examples e where e.question_id = q.id)
      and not exists (select 1 from public.attempts a where a.question_id = q.id)
      and not exists (select 1 from public.feedback f where f.question_id = q.id)
      and not exists (select 1 from public.paper_questions p where p.question_id = q.id)
      and not exists (select 1 from public.questions d where d.duplicate_of = q.id)
    returning 1
  )
  select count(*) into removed from gone;
  if removed > 25 then
    raise exception 'expected at most 25 mock drafts, removed %', removed;
  end if;
end
$$;
