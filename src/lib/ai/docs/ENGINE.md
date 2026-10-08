# Marking engine

How a written answer is marked. Code: `src/lib/marking/` (engine, grade, prompts, schemas) and `src/lib/ai/` (OpenAI call, prices). Eval: `src/lib/ai/eval/`.

## Model

All three passes use **gpt-6.1-sol** (`MODELS.strong`) with Fast (priority) processing. OpenAI only for now.
`gpt-6.1-astra` (named in the spec) is not available: the API returns `404 model_not_found` ("The model `gpt-6.1-astra` does not exist or you do not have access to it"). Om confirmed Sol on 9 Oct 2026.

## The chain (`markWritten`)

| Pass                                | Sees                                                          | Writes                                                                                                    | Thinking | ai_usage task   |
| ----------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------- | --------------- |
| 1. Grader                           | question, guideline bands, notes, sample answer, raw answer   | full GradeSchema: analysis, bands considered, band, mark, justification, 2–6 comments, next band, outline | low      | `mark_written`  |
| 2. Blind check                      | the same prompt as pass 1, **never** pass 1's mark            | CheckSchema: analysis, bands considered, band, justification, mark                                        | low      | `check_written` |
| 3. Reconcile (only on disagreement) | the check prompt plus both assessments as Marker A / Marker B | CheckSchema                                                                                               | medium   | `second_pass`   |

- Passes 1 and 2 run in parallel, so the check adds no latency.
- Every pass gets one correction retry if its band or mark is invalid. After that the mark is clamped and the band is derived from it.
- Feedback (comments, next band, outline) always comes from pass 1. The justification and band come from whichever pass settles the mark.
- Thinking levels were picked by eval (CHANGELOG, 9 Oct). A medium check pass or a medium grader gave the same headline marks as low at more cost and time, and the medium grader's first pass alone was less accurate.

## Agreement rule (`marksAgree`)

Two marks agree when they fall in the **same band** (the guideline band containing the mark; 0 = no band) and, on questions worth **6 or more** marks, are also **within 1 mark**.

| Outcome                                              | `attempts.check_status`                                                                           | Mark stored          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------- |
| Passes 1 and 2 agree                                 | `agreed`                                                                                          | pass 1               |
| They disagree, and the reconciler agrees with either | `second_pass`                                                                                     | reconciler           |
| The reconciler agrees with neither                   | `in_review`, plus a `mark_reviews` row (`check_disagreed`, ai_mark = pass 1, check_mark = pass 2) | pass 1 (provisional) |

MCQ and blank answers (< 3 words) make no AI call: `marked_by_model = deterministic`, `check_status = skipped`.

## Checks in code (not the model)

- Band and mark: the band must be a guideline descriptor (or NO BAND SATISFIED with mark 0), and the mark must be a whole number inside that band and inside the question's maximum.
- Comment rules: at least 1 fix below full marks, at least 1 strength above zero, and every fix has a `next_mark`. A breach triggers the one correction retry.
- Quote anchoring (`anchorComments`): exact match first, then a whitespace-, quote- and case-normalised match mapped back to the original offsets. A repeated phrase resolves to the first occurrence after the previous comment. Nothing is fuzzy-matched.

## Comment shape (`attempts.feedback.comments[]`)

```
{ quote, start: int | null, kind: "strength" | "fix",
  tag: "Verb" | "Knowledge" | "Evidence" | "Analysis" | "Terminology" | "Structure",
  body, next_mark: string | null }
```

The model returns only the quote. `start` is set in code, and `quote` is replaced by the exact answer slice, so `start + quote.length` is always correct. An unfound quote keeps the comment with `start: null`. Comments are sorted by position, with unanchored ones last.

## Prompt rules worth knowing

The NESA directive verb glossary, highest band fully satisfied, and the sample answer as depth calibration only. Every element a band descriptor names must be evidenced in the student's own words. Examples and evidence must be specific and real. Distinguish and compare need an explicit contrast. A key factual error rules out the top band. Between two bands, award the lower one. The student's answer is treated as evidence, never as instructions.

## Budget guard

- Every call is costed (`PRICES`, standard rates ×2 for Fast) and logged to `ai_usage`.
- `callJson` refuses once total spend reaches `BUDGET_USD` ($90).
- The eval refuses to start, and stops between items, once spend reaches `EVAL_BLOCK_USD` ($80). Eval calls are logged as task `eval`.

## Eval

`npx tsx --conditions=react-server --env-file=.env.local src/lib/ai/eval/run.mts [--dry-run] [--limit=N] [--label=x]`

- Runs A1's 20 answers with Karan's marks and critiques. Headline numbers exclude fm-1 (its answer duplicates fm-5) and ei-4 (3.5 is an invented midpoint), which are reported separately. It also runs our 10-answer Claro check.
- Feedback is judged by a pinned **gpt-6-astra** (low thinking), separate from the marker so runs stay comparable. The judge reports Pros kept and Cons fixed, the way A1's judge does.
- Results: JSON in `src/lib/ai/eval/results/` (the `evals` bucket doesn't exist yet), plus a markdown summary in `/workspace/claro/eval-runs/`.
