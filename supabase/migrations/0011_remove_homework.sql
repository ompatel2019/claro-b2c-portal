-- Remove homework: no teachers in B2C. Homework sessions were test data; their attempts and reviews cascade.
drop function if exists public.start_homework(uuid);
drop function if exists public.rewrite_homework_items(uuid, text[], text[]);
delete from public.sessions where kind = 'homework';
alter table public.sessions drop constraint sessions_homework_check;
alter table public.sessions drop column homework_set_id; -- also drops its FK and unique index
alter table public.sessions drop constraint sessions_kind_check;
alter table public.sessions add constraint sessions_kind_check check (kind in ('sprint', 'flashcards'));
drop table public.homework_items;
drop table public.homework_sets;
