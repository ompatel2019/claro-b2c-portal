// @vitest-environment node
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const query = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
}));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({ from: query.from }),
}));

import { bandExamples, pickBandExamples } from "./examples";
import type { MarkableQuestion } from "./grade";

const criteria = [
  { min: 1, max: 1, descriptor: "Some" },
  { min: 2, max: 3, descriptor: "Sound" },
];
const ex = (tutor_mark: number, answer_text = `m${tutor_mark}`) => ({
  answer_text,
  tutor_mark,
});

it("picks up to two whole-mark anchors per band and for 0, highest band first", () => {
  expect(
    pickBandExamples(criteria, [
      ex(1, "a"),
      ex(0, "z"),
      ex(2.5),
      ex(3, "b"),
      ex(1, "c"),
      ex(1, "d"),
      ex(2, "e"),
      ex(3, "f"),
    ]).map((e) => e.answer_text),
  ).toEqual(["b", "e", "a", "c", "z"]);
  expect(pickBandExamples(criteria, [])).toEqual([]);
});

it("reads the grader view for the question, which excludes test rows", async () => {
  query.from.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockResolvedValue({ data: [ex(2), ex(1)], error: null });
  const q = { id: "a1-m2-21a", criteria } as MarkableQuestion;
  expect(await bandExamples(q)).toEqual([ex(2), ex(1)]);
  expect(query.from).toHaveBeenCalledWith("marking_examples_for_grader");
  expect(query.eq).toHaveBeenCalledWith("question_id", "a1-m2-21a");
  query.order.mockResolvedValue({ data: null, error: { message: "boom" } });
  await expect(bandExamples(q)).rejects.toThrow("marking examples: boom");
});
