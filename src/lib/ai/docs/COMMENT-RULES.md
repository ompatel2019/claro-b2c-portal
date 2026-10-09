# Comment rules

See [ENGINE](/admin/marking/engine?tab=docs&doc=ENGINE) for comment shape, counts, comment-kind validation, retries and quote anchoring.

## Prompt rules

The prompt in `src/lib/marking/prompts.ts` requires:

- `quote`: the shortest phrase that makes the point, copied character for character, never paraphrased or a whole paragraph.
- `body`: 1–2 concise sentences speaking to the student, in Australian English.
- `next_mark`: the specific change that earns the next mark, on fixes only; null on strengths.
- At least one strength and one fix unless full marks, then strengths only. Phrase advice as what earns the next mark, rather than what the student “should have” done.
- `earned` and `missing_points`, plus **3–6** `better_answer_outline` bullets.
- `why_not_higher` and advice for reaching the next band in `next_band`; an empty `next_band` at full marks.

## Tags

| Tag         | Prompt meaning                        |
| ----------- | ------------------------------------- |
| Verb        | Meeting the directive verb.           |
| Knowledge   | Accuracy of economic concepts.        |
| Evidence    | Statistics, examples and data.        |
| Analysis    | Cause-and-effect links and judgement. |
| Terminology | Precise economic terms.               |
| Structure   | Organisation, focus and length.       |

See [VERB-GUIDE](/admin/marking/engine?tab=docs&doc=VERB-GUIDE) for directive meanings.

## Enforcement gaps

The strict schema in `src/lib/marking/schemas.ts` checks field types, kinds, tags and counts. It does **not** enforce sentence counts, shortest quotes, meaningful bodies, Australian English, tag suitability or an empty `next_band` at full marks.

`validateGrade` in `src/lib/marking/grade.ts` does not require a strength at zero or prohibit fixes at full marks. It does not check advice quality. If the first grader still fails validation after correction, its comments are retained and `feedback.validated` is false. This field records only the first grader's validation result; validation failures in the checker or reconciler do not change it (`src/lib/marking/engine.ts`).

## Display and edited feedback

`readComments` in `src/lib/feedback.ts` accepts legacy `comment`/`type` fields, drops empty bodies, treats non-strength kinds as fixes and turns unknown tags into null. It verifies that the stored offset and quote still exactly match the displayed answer; stale anchors move to “Overall”. It also assigns display numbers to comments.

`nextMarkLine` uses an explicit saved `next_mark_line` first. Otherwise full marks show “Full marks. Nothing missing.”; below full marks it uses the first ordered fix with advice, falling back to `next_band`.

`src/components/annotated-feedback.tsx` shows kind, tag, body and fix advice, links comments to text highlights, groups unanchored comments under “Overall”, and exposes the outline under “How to reach full marks”.

Admin edits in `src/app/admin/marking/review/actions.ts` have separate limits: up to 100 comments, quote up to 20,000 characters, trimmed non-empty body up to 4,000, and next-mark text up to 4,000. New comments require an exact selected quote/offset and a tag; changed legacy comments require a tag. AI count and strength/fix requirements are not applied to these edits.
