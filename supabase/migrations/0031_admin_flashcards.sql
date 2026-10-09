-- Shared cards only; aggregate the complete review history before Data API pagination.
create function public.admin_flashcard_rows()
returns table (id text, front text, back text, kind text, topic_id text, status text,
  origin text, updated_at timestamptz, reviews bigint, knew_first numeric, avg numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  return query
  with reviewed as (
    select r.flashcard_id, r.session_id, r.mark,
      row_number() over (partition by r.flashcard_id, r.session_id order by r.created_at, r.id) as attempt
    from public.flashcard_reviews r
    join public.flashcards f on f.id = r.flashcard_id and f.owner_id is null
  ), stats as (
    select r.flashcard_id, count(*) as reviews,
      round(100 * avg(case when r.mark = 1 then 1 else 0 end)
        filter (where r.session_id is not null and r.attempt = 1)) as knew_first,
      round(100 * avg(r.mark)) as avg
    from reviewed r group by r.flashcard_id
  )
  select f.id, f.front, f.back, f.kind, f.topic_id, f.status, f.origin, f.updated_at,
    coalesce(s.reviews, 0), s.knew_first, s.avg
  from public.flashcards f left join stats s on s.flashcard_id = f.id
  where f.owner_id is null;
end;
$$;
revoke all on function public.admin_flashcard_rows() from public, anon;
grant execute on function public.admin_flashcard_rows() to authenticated;
