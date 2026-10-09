# Marking principles

## Band decision

See [ENGINE](/admin/marking/engine?tab=docs&doc=ENGINE) for band-selection prompt rules, evidence requirements, band anchors, validation, retries and deterministic answer routes.

## Depth calibration

- Different valid wording can earn full marks. Credit an imprecise but present idea and note its imprecision separately; an improvement suggestion is not a deduction.
- Statistics are required only when the question or criteria demand them.
- A brief sentence rarely satisfies the top band of a question worth 3 or more marks. See [VERB-GUIDE](/admin/marking/engine?tab=docs&doc=VERB-GUIDE) for explanation and analysis depth.

The same band procedure applies to extended 20-mark responses. The prompt places coherent but general explanations without data woven into analysis in the middle band (9–12). It asks for applied data, trends and contemporary evidence in the second-top band, and sustained integration of evidence and theory in the top band. Naming an example is not the same as applying economic information. This is prompt calibration, not a separate server-side scoring formula.

## Descriptor matching

`findBand` in `src/lib/marking/grade.ts` uses a **string-matching heuristic**: lowercase, strip punctuation, collapse whitespace, then try equality before containment in either direction. The prompt requires a verbatim descriptor; the server accepts this broader match and stores the matched guideline descriptor.

## Answer routes and student feedback

Single checks skip AI only for empty or whitespace-only text, in `src/lib/single-check-marking.ts`. Bank checks use the bank guideline. Own questions always receive synthetic one-mark bands with approximate percentage descriptors; pasted criteria become calibration notes. These marks are estimates, including when criteria are supplied.

Both session marking and single checks use `transcript` when non-null, otherwise `answer_text`. The prompt says not to penalise words marked `[?]`. See [TRANSCRIPTION](/admin/marking/engine?tab=docs&doc=TRANSCRIPTION) for photo handling.

`src/components/annotated-feedback.tsx` shows the mark, matched band range, strengths, fixes and next-mark advice, with annotated text and expandable guidelines, sample answer and better-answer outline. See [COMMENT-RULES](/admin/marking/engine?tab=docs&doc=COMMENT-RULES) for comment display and [CHECK-AND-AGREEMENT](/admin/marking/engine?tab=docs&doc=CHECK-AND-AGREEMENT) for provisional feedback.
