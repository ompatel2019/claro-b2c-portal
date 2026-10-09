import "server-only";

import { admin } from "@/utils/supabase/admin";
import type { Criterion, MarkableQuestion } from "./grade";

export type MarkedExample = { answer_text: string; tutor_mark: number };

/**
 * Band anchors for the grader: up to two tutor-marked answers for each band (and for 0),
 * highest band first. Whole tutor marks only, so every anchor sits squarely in one band.
 */
export function pickBandExamples(
  criteria: Criterion[],
  examples: MarkedExample[],
): MarkedExample[] {
  const whole = examples.filter((e) => Number.isInteger(Number(e.tutor_mark)));
  return [...criteria]
    .sort((a, b) => b.max - a.max)
    .concat({ min: 0, max: 0, descriptor: "" })
    .flatMap(({ min, max }) =>
      whole
        .filter(
          (e) => Number(e.tutor_mark) >= min && Number(e.tutor_mark) <= max,
        )
        .slice(0, 2),
    );
}

/** Band anchors for a question. Reads only the grader view, which never holds split 'test' rows. */
export async function bandExamples(q: MarkableQuestion) {
  const { data, error } = await admin()
    .from("marking_examples_for_grader")
    .select("answer_text, tutor_mark")
    .eq("question_id", q.id)
    .order("id");
  if (error) throw new Error(`marking examples: ${error.message}`);
  return pickBandExamples(q.criteria, data ?? []);
}
