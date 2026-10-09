# Engine changelog

Eval = A1 set, 18 headline items (fm-1 and ei-4 excluded). Signed error: + = lenient. Marker gpt-6.1-sol (Fast). Judge gpt-6-astra/low. Result files are in `src/lib/ai/eval/results/`. Runs marked dirty were made on an uncommitted change (the eval varied one setting), and the setting is recorded in the file.

## 9 Oct 2026: band-anchored examples (A1 tutor-marked answers in the grader prompt)

Up to two tutor-marked answers per band from the same question, from the non-test view (ENGINE.md, Band anchors). The A1 18 questions have no examples, so their prompts are unchanged and their numbers move only by run noise. Held-out = 196 A1 mock answers (split `test`), marks only.

| Run                                | Set      | Exact | Within-1 | Band  | Signed | Mean \|Δ\| | Judge | $/answer | s/answer | Check agreed |
| ---------------------------------- | -------- | ----- | -------- | ----- | ------ | ---------- | ----- | -------- | -------- | ------------ |
| 1159 shipped 0940 engine           | A1 18    | 44.4% | 88.9%    | 50.0% | +0.44  | 0.61       | 4.67  | 0.0198   | 13.1     | 100%         |
| 1159 shipped 0940 engine           | Held-out | 44.9% | 94.4%    | 44.9% | +0.15  | 0.61       | —     | 0.0234   | 15.2     | 93.4%        |
| **1211 anchors (shipped)**         | A1 18    | 44.4% | 88.9%    | 50.0% | +0.44  | 0.61       | 4.83  | 0.0198   | 12.5     | 100%         |
| **1211 anchors (shipped)**         | Held-out | 45.9% | 95.4%    | 45.9% | +0.08  | 0.59       | —     | 0.0274   | 16.0     | 92.3%        |
| 1222 anchors + tutor notes (trial) | A1 18    | 44.4% | 88.9%    | 50.0% | +0.44  | 0.61       | 4.44  | 0.0206   | 13.3     | 94.4%        |
| 1222 anchors + tutor notes (trial) | Held-out | 43.4% | 96.4%    | 43.4% | +0.05  | 0.60       | —     | 0.0286   | 16.0     | 91.3%        |

The held-out gain is small: paired against 1159, 15 answers moved closer to the tutor's mark and 11 further away (170 unchanged), so +1 point exact is within run noise. The clearer effect is less leniency on 3–6 mark questions (signed +0.19 to +0.04 on 3-markers). Both engines over-mark weak answers and under-mark strong ones (tutor 0: about +0.75; tutor 4–5: about −0.7). Band equals exact on held-out because every A1 mock band is a single mark. Claro check 10/10 in every run. Shipped 1211; the tutor-notes trial was dropped (held-out exact −2.5 points against 1211).

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
