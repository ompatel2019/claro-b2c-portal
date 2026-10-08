import { expect, it } from "vitest";
import { splitExamples } from "./split";

const rows = (question: string, marks: number[]) =>
  marks.map((tutor_mark, i) => ({
    question,
    source_hash: `${question}-${i}`,
    tutor_mark,
  }));

it("takes up to 6 whole-mark test answers per question, spread across marks", () => {
  const out = splitExamples([
    ...rows(
      "a",
      [0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 1.5, 2.5, 2, 2, 2, 1, 1, 1, 2, 2],
    ),
    ...rows("b", [1, 2, 2]),
  ]);
  const test = out.filter((r) => r.split === "test");
  const a = test.filter((r) => r.question === "a");
  expect(a).toHaveLength(6);
  expect(new Set(a.map((r) => r.tutor_mark))).toEqual(new Set([0, 1, 2, 3]));
  expect(test.every((r) => Number.isInteger(r.tutor_mark))).toBe(true);
  expect(test.filter((r) => r.question === "b")).toHaveLength(1);
});

it("keeps at least two thirds of a question as examples and is stable", () => {
  const input = rows("c", [1, 2, 1, 2, 1]);
  expect(splitExamples(input).filter((r) => r.split === "test")).toHaveLength(
    1,
  );
  expect(
    splitExamples([...input].reverse()).find((r) => r.split === "test"),
  ).toEqual(splitExamples(input).find((r) => r.split === "test"));
  expect(
    splitExamples(rows("d", [1, 2])).every((r) => r.split === "example"),
  ).toBe(true);
});
