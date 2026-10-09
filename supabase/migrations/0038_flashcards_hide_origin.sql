-- Students read flashcards through RLS, but never need where a card came from (origin, origin_ref).
-- Replace the table-wide SELECT with column grants that leave those two out. INSERT/UPDATE are
-- unchanged (own-card writes still set origin = 'student'; the RLS checks run as before), and the
-- service role / admin RPC (admin_flashcard_rows, security definer) are unaffected.
-- Additive in effect: no data, columns or policies change. questions.origin is deliberately NOT
-- revoked here: the sprint pool RPCs run as the student and filter on it (0021).
revoke select on public.flashcards from authenticated;
grant select (id, topic_id, kind, front, back, created_at, owner_id, status, dedupe_key, updated_at)
  on public.flashcards to authenticated;
