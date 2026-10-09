# Check and agreement

See [ENGINE](/admin/marking/engine?tab=docs&doc=ENGINE) for pass visibility, the agreement rule, marking outcomes and which pass supplies feedback.

## Other statuses

- `skipped`: the default for attempts without a written AI check.
- `reviewed`: successful admin resolution saves the final mark and feedback.

The database permits the three ENGINE outcomes plus `skipped` and `reviewed` after `supabase/migrations/0020_check_status_and_a1_eval.sql`; the initial default is `skipped` in `supabase/migrations/0014_marking_check.sql`. `pending` remains recognised in `src/lib/feedback.ts` but is not permitted by the current constraint or written by this chain.

A separate pending-check phase is not built: both passes complete within one request, using attempt `status = marking` meanwhile (`src/lib/marking/engine.ts`).

## Review queue and failures

Both `src/lib/marking/engine.ts` and `src/lib/single-check-marking.ts` insert the disagreement review before saving the attempt. Duplicate open-review inserts are tolerated. If that save fails, the catch attempts to set `status = failed`, while the open review remains.

`src/lib/feedback.ts` displays unresolved checker disagreement as a range between the initial marks when they differ. `src/components/annotated-feedback.tsx` shows provisional feedback and “Our team is double-checking this mark.” Successful resolution shows “Checked by our team” via `src/components/status-pill.tsx`.

Other queue entries:

- `src/app/api/attempts/[id]/dispute/route.ts` accepts a 10–1,000 character note on a finished, written attempt shown as marked or reviewed; it creates `student_dispute` and sets `in_review`. The database permits one open review per attempt. The three-open-disputes limit per student is a request-time count before insertion, without a transaction or per-student database constraint; concurrent requests can exceed it.
- `src/app/admin/marking/review/actions.ts` samples up to five agreed answers from the last seven days as `spot_check`, without changing their check status. Manual marking of failed/unreadable attempts also opens a spot-check review.
- The queue has a separate failed/unreadable tab (`src/app/admin/marking/review/data.ts`); a failed attempt can also retain an open review as above.

Admin resolution sets `reviewed`, saves mark/band/feedback, records the resolver and refreshes the session score. Saves are sequential after a guarded review claim in `src/app/admin/marking/review/actions.ts`.

Resolution is not transactional. If a later save fails, the action attempts to reopen the review and reports whether recovery succeeded.

## Offline accuracy and exact marks

`evalAgreement` in `src/app/admin/marking/accuracy/helpers.ts` uses `score.band` when supplied, otherwise falls back to an exact mark match. Agreement requires that band condition **and**, on 6+ mark questions, distance at most 1. A supplied false band flag does not become agreement merely because the mark matches.

For an expected range, distance is 0 anywhere inside it; outside it, distance is to the nearest end. **Exact mark %** is the proportion with distance 0, so an in-range mark counts as exact. The default accuracy scope includes successful, non-excluded Held-out items with finite maximum marks and valid marks/expectations. Engine's numeric scope includes all valid numeric items regardless of section or exclusion flags. An empty denominator returns null.

`src/lib/ai/eval/metrics.ts` defines scalar `score.exact` as strict mark equality. Its band flag allows fractional expected marks to touch bands through either floor or ceiling, and treats two marks with no matching bands as the same band. This is a heuristic for eval band comparison, separate from the production whole-mark lookup.
