import { z } from "zod";

export const GradeSchema = z.strictObject({
  analysis: z.strictObject({
    strengths: z.array(z.string()),
    imprecise: z.array(
      z.strictObject({ point: z.string(), issue: z.string() }),
    ),
    missing: z.array(z.string()),
  }),
  elements_identified: z.string(),
  bands_considered: z.array(
    z.strictObject({
      band: z.string(),
      satisfied: z.boolean(),
      evidence: z.string(),
    }),
  ),
  band_selected: z.string(),
  justification: z.string(),
  why_not_higher: z.string(),
  mark: z.number().int(),
  comments: z
    .array(
      z.strictObject({
        quote: z.string(),
        kind: z.enum(["strength", "fix"]),
        tag: z.enum([
          "Verb",
          "Knowledge",
          "Evidence",
          "Analysis",
          "Terminology",
          "Structure",
        ]),
        body: z.string(),
        next_mark: z.string().nullable(),
      }),
    )
    .min(2)
    .max(6),
  earned: z.array(z.string()),
  missing_points: z.array(z.string()),
  next_band: z.string(),
  better_answer_outline: z.array(z.string()).min(3).max(6),
});

export const CheckSchema = GradeSchema.pick({
  analysis: true,
  bands_considered: true,
  band_selected: true,
  justification: true,
  mark: true,
});

export const TranscriptSchema = z.strictObject({
  lines: z.array(z.string()),
  notes: z.string(),
});
export const FlashcardSchema = z.strictObject({
  reason: z.string(),
  mark: z.literal([0, 0.5, 1]),
});
export const SummarySchema = z.strictObject({
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  next_steps: z.array(z.string()),
});
