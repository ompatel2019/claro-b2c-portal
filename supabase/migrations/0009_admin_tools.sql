-- Transactional homework item rewrite (admin only) and column grant for marking guidelines on admin reads via service role already; this RPC keeps item edits atomic.
create or replace function public.rewrite_homework_items(
  p_set uuid,
  p_flashcard_ids text[],
  p_question_ids text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started integer;
  v_published timestamptz;
  v_pos integer := 0;
  v_id text;
begin
  if not (select public.is_admin()) then
    raise exception 'admin only';
  end if;
  select published_at into v_published from public.homework_sets where id = p_set;
  if not found then raise exception 'homework not found'; end if;
  select count(*) into v_started from public.sessions where homework_set_id = p_set;
  if v_published is not null or v_started > 0 then
    raise exception 'items locked';
  end if;
  delete from public.homework_items where set_id = p_set;
  if p_flashcard_ids is not null then
    foreach v_id in array p_flashcard_ids loop
      v_pos := v_pos + 1;
      insert into public.homework_items (set_id, position, flashcard_id, question_id)
      values (p_set, v_pos, v_id, null);
    end loop;
  end if;
  if p_question_ids is not null then
    foreach v_id in array p_question_ids loop
      v_pos := v_pos + 1;
      insert into public.homework_items (set_id, position, flashcard_id, question_id)
      values (p_set, v_pos, null, v_id);
    end loop;
  end if;
end;
$$;
revoke execute on function public.rewrite_homework_items(uuid, text[], text[]) from public, anon;
grant execute on function public.rewrite_homework_items(uuid, text[], text[]) to authenticated;
