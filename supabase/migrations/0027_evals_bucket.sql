-- Private evaluation results; service role only. No anon/authenticated policies.
insert into storage.buckets (id, name, public)
values ('evals', 'evals', false)
on conflict do nothing;
