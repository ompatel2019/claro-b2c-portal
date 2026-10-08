-- Speed per-user ai_usage window counts for rate limiting. RLS unchanged.
create index if not exists ai_usage_user_created_idx
  on public.ai_usage (user_id, created_at desc);
