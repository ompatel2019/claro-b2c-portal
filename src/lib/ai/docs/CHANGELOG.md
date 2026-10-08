# Engine changelog

Eval = A1 set, 18 headline items (fm-1 and ei-4 excluded). Signed error: + = lenient. Marker gpt-6.1-sol (Fast). Judge gpt-6-astra/low. Result files are in `src/lib/ai/eval/results/`. Runs marked dirty were made on an uncommitted change (the eval varied one setting), and the setting is recorded in the file.

## 9 Oct 2026: band-descriptor element check (prompt)

Every element named in a band descriptor must be evidenced. Examples and evidence must be specific. Distinguish and compare need an explicit contrast. A key factual error rules out the top band. Between two bands, the lower one.
Run 0940 (grade low, check low, reconcile medium):

|      | Exact | Within-1 | Band  | Signed | Mean \|Δ\| | Pros kept | Cons fixed | Judge | $/answer | s/answer | Check agreed |
| ---- | ----- | -------- | ----- | ------ | ---------- | --------- | ---------- | ----- | -------- | -------- | ------------ |
| 0940 | 44.4% | 88.9%    | 50.0% | +0.44  | 0.61       | 42.9%     | 40.9%      | 4.83  | 0.0178   | 13.8     | 88.9%        |

The reconciler settled 2 disagreements, both to Karan's mark. 0 went to review. Claro check: 10/10. fm-1: 1 (Karan 2). ei-4: 5 (Karan 3.5).
Thinking-level trial, run 0951 (grade **medium**): the headline marks were identical. First pass alone: 27.8% exact vs 38.9% at low. 15.4 s vs 13.8 s per answer. Kept the grader at low.

## 9 Oct 2026: blind second pass + reconcile, check result in attempts.check_status / mark_reviews

Run 0920 (low / low / medium): the marks were the same as the baseline on every item. Exact 33.3%, within-1 88.9%, band 38.9%, signed +0.67, Pros 35.7%, Cons 31.8%, judge 4.33, $0.0149, 12.1 s. Blind check agreed on 94.4%.
Thinking-level trial, run 0930 (check **medium**): within-1 fell to 83.3% (ep-5 was reconciled up to 5) with no other change. Kept the check at low.

## 9 Oct 2026: §2.1 comment shape (kind, tag, body, next_mark; offsets in code)

Shipped with the chain above, so it is measured by run 0920.

## Baseline: engine before these changes (single pass, Sol low, old comment shape)

Run 0901: exact 33.3%, within-1 88.9%, band 38.9%, signed +0.67, mean |Δ| 0.72, Pros 33.3%, Cons 31.8%, judge 4.44, $0.0107, 12.1 s. Claro check 10/10. fm-1: 1. ei-4: 6.
