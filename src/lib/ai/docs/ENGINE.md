# Marking engine

How a written answer is marked. Code: `src/lib/marking/` (engine, examples, grade, prompts, schemas) and `src/lib/ai/` (OpenAI call, prices). Eval: `src/lib/ai/eval/`.

## Model

All three marker passes use **anthropic/claude-sonnet-5.5** through OpenRouter (`MARKER.model = MODELS.marker` in `src/lib/marking/engine.ts`): grader low, blind check low, reconcile medium. In `src/lib/ai/openai.ts`, `anthropic/` model ids use the OpenRouter baseURL (`https://openrouter.ai/api/v1`), `OPENROUTER_API_KEY` and `provider.require_parameters`, with no priority tier. `prices.ts` records $2 input / $0.10 cached input / $10 output per 1M tokens.

Handwriting stays on **gpt-6.1-sol** and flashcards on **gpt-6-luna**; the eval judge stays **gpt-6-astra** (low). To switch marking back to Sol, change one line: `MARKER.model = MODELS.strong` (or `MODELS.marker = "gpt-6.1-sol"`), then update the engine and price tests that assert `MODELS.marker` / the Sonnet marker.

## The chain (`markWritten`)

| Pass                                | Sees                                                                      | Writes                                                                                                    | Thinking | ai_usage task   |
| ----------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------- | --------------- |
| 1. Grader                           | question, guideline bands, notes, sample answer, band anchors, raw answer | full GradeSchema: analysis, bands considered, band, mark, justification, 2–6 comments, next band, outline | low      | `mark_written`  |
| 2. Blind check                      | the same prompt as pass 1, **never** pass 1's mark                        | CheckSchema: analysis, bands considered, band, justification, mark                                        | low      | `check_written` |
| 3. Reconcile (only on disagreement) | the check prompt plus both assessments as Marker A / Marker B             | CheckSchema                                                                                               | medium   | `second_pass`   |

- Passes 1 and 2 run in parallel, so the check adds no latency.
- All three passes see the same band anchors (below), so they share one prompt prefix per question. The prefix is only cached on OpenAI models; the OpenRouter/Sonnet route sends no cache markers, so it is not cached.
- Format retry: Anthropic structured outputs do not enforce array min/max counts. A reply that fails the Zod schema gets one retry on the same model, with a short user message naming up to three failing fields. Any other error or a second schema failure fails as before. The band-correction call gets its own schema retry, so one pass can make up to four calls.
- Every pass gets one correction retry if its band or mark is invalid. After that the mark is clamped and the band is derived from it.
- Feedback (comments, next band, outline) always comes from pass 1. The justification and band come from whichever pass settles the mark.
- Thinking levels were picked by eval (CHANGELOG, 9 Oct). A medium check pass or a medium grader gave the same headline marks as low at more cost and time, and the medium grader's first pass alone was less accurate.

## Band anchors (`examples.ts`)

Before marking, `bandExamples` reads the question's tutor-marked answers from the **`marking_examples_for_grader`** view only. That view excludes `split = 'test'`, so held-out answers can never reach a prompt. `pickBandExamples` keeps whole tutor marks and takes up to **two per band** (and two at 0), highest band first, in a fixed order (by id). They go in the user message after the sample answer and before `<student_answer>`, wrapped as `<marked_answer tutor_mark="n">` and treated as evidence, never instructions. Questions with no examples (all NESA questions, and the A1 eval-set bank questions) get exactly the old prompt.
Examples today: 2,007 anonymised A1 mock-exam answers on the 41 retired `a1-m*` questions (origin `a1`, split `example`), imported by `src/lib/ai/eval/import-a1-examples.mts`. Tutor notes are not shown: adding them lowered held-out exact (CHANGELOG, run 1222).

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

- Every reply is costed (`PRICES`) and logged to `ai_usage` before validation, including failed-format replies. OpenAI Fast calls cost standard rates ×2; Anthropic calls have no priority surcharge.
- `callJson` refuses once total spend reaches `BUDGET_USD` ($90).
- The eval refuses to start, and stops between items, once spend reaches `EVAL_BLOCK_USD` ($80). Eval calls are logged per item as task `eval:<stamp>:<item>:mark` or `:judge`, which is how each item is costed.

## Eval

`npx tsx --conditions=react-server --env-file=.env.local src/lib/ai/eval/run.mts [--dry-run] [--limit=N | --items=i,j] [--label=x]`

- Runs A1's 20 answers with Karan's marks and critiques. Headline numbers exclude fm-1 (its answer duplicates fm-5) and ei-4 (3.5 is an invented midpoint), which are reported separately. It also runs our 10-answer Claro check.
- **Held-out set**: the 196 `marking_examples` rows with `split = 'test'` on the `a1-m*` mock questions (up to 6 whole-mark answers per question spread across marks, fixed seed in `split.ts`). Reported as its own section with the same mark metrics. It has no judge, because there is no Karan critique for these answers. These questions were never used to tune the prompt.
- Items run 6 at a time; `--limit=N` applies per section.
- For small targeted runs, `--items=i,j` selects 0-based positions in the full array: A1, then Held-out, then Claro. It cannot be combined with `--limit`. The `ai_usage` task index `eval:<stamp>:<n>` is the position in the selected list, not the full-array index.
- Feedback is judged by a pinned **gpt-6-astra** (low thinking), separate from the marker so runs stay comparable. The judge reports Pros kept and Cons fixed, the way A1's judge does.
- Results: JSON in `src/lib/ai/eval/results/` (the `evals` bucket doesn't exist yet), plus a markdown summary in `/workspace/claro/eval-runs/`.
- Stamps have minute resolution: two runs started in the same minute overwrite each other.
