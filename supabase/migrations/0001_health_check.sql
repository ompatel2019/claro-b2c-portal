create table if not exists public.health_check (
  id bigint generated always as identity primary key,
  message text not null,
  created_at timestamptz not null default now()
);
alter table public.health_check enable row level security;
create policy "health_check public read" on public.health_check for select to anon, authenticated using (true);
grant select on public.health_check to anon, authenticated;
insert into public.health_check (message) values ('Claro portal is connected to Supabase');
