-- session_review adds topic_id/year (for "Practise similar") and the attempt's latest mark review,
-- so results can show the provisional range (in_review) and the dispute pill without a second query.
drop function public.session_review(uuid);
create function public.session_review(p_session uuid)
returns table (
  attempt_id uuid, "position" smallint, question_id text, type text, marks smallint,
  stem text, stimulus text, options text[], source text, topic_id text, year smallint,
  choice_index smallint, answer_text text, transcript text, image_paths text[], flagged boolean,
  status text, check_status text, mark numeric, max_marks smallint, band text, feedback jsonb,
  correct_index smallint, criteria jsonb, sample_answer text, explanation text, review jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.position, a.question_id, q.type, q.marks, q.stem, q.stimulus, q.options, q.source,
    q.topic_id, q.year,
    a.choice_index, a.answer_text, a.transcript, a.image_paths, a.flagged,
    a.status, a.check_status, a.mark, a.max_marks, a.band, a.feedback,
    q.correct_index, q.criteria, q.sample_answer, q.explanation,
    (select jsonb_build_object('status', r.status, 'reason', r.reason, 'ai_mark', r.ai_mark,
        'check_mark', r.check_mark, 'final_mark', r.final_mark)
      from public.mark_reviews r where r.attempt_id = a.id
      order by (r.status = 'open') desc, r.created_at desc limit 1)
  from public.sessions s
  join public.attempts a on a.session_id = s.id
  left join public.questions q on q.id = a.question_id
  where s.id = p_session and s.finished_at is not null
    and (s.user_id = (select auth.uid()) or (select public.is_admin()))
  order by a.position;
$$;
revoke execute on function public.session_review(uuid) from public, anon;
grant execute on function public.session_review(uuid) to authenticated;
