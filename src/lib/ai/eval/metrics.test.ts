// @vitest-environment node
import { expect, it } from "vitest";
import { evalBlocked, sameBand, scoreItem, summarise } from "./metrics";

const criteria = [
  { min: 3, max: 4, descriptor: "High" },
  { min: 2, max: 2, descriptor: "Middle" },
  { min: 1, max: 1, descriptor: "Low" },
];

it("shares either neighbouring band for half marks", () => {
  expect(sameBand(criteria, 1.5, 1)).toBe(true);
  expect(sameBand(criteria, 1.5, 2)).toBe(true);
  expect(sameBand(criteria, 1.5, 3)).toBe(false);
  expect(sameBand(criteria, 2.5, 4)).toBe(true);
  expect(sameBand(criteria, 3, 4)).toBe(true);
  expect(sameBand(criteria, 0, 1)).toBe(false);
  expect(sameBand(criteria, 0, 9)).toBe(true);
  expect(sameBand([{ min: 0, max: 1, descriptor: "Zero" }], 0, 1)).toBe(false);
  expect(sameBand([], 1, 2)).toBe(true);
});

it("scores signed and absolute errors, rates and pooled verdicts", () => {
  const row = (expected: number, mark: number) => ({
    score: scoreItem({ criteria, marks: 4, expected, mark }),
    usd: 0.02,
    seconds: 2,
  });
  expect(row(2, 1).score).toEqual({
    delta: -1,
    exact: false,
    within1: true,
    band: false,
  });
  expect(
    summarise([
      {
        ...row(1, 1),
        verdict: {
          pros: [{ delivered: true }, { delivered: false }],
          cons: [{ fixed: false }],
          score: 4,
        },
      },
      {
        ...row(1, 3),
        verdict: {
          pros: [{ delivered: true }],
          cons: [{ fixed: true }, { fixed: true }],
          score: 8,
        },
      },
      { ...row(2, 1), verdict: null },
    ]),
  ).toEqual({
    n: 3,
    exact: 1 / 3,
    within1: 2 / 3,
    band: 1 / 3,
    meanSigned: 1 / 3,
    meanAbs: 1,
    prosKept: 2 / 3,
    consFixed: 2 / 3,
    judgeMean: 6,
    usdPerAnswer: 0.02,
    secondsPerAnswer: 2,
  });
});

it("returns null for empty denominators", () => {
  expect(summarise([])).toEqual({
    n: 0,
    exact: null,
    within1: null,
    band: null,
    meanSigned: null,
    meanAbs: null,
    prosKept: null,
    consFixed: null,
    judgeMean: null,
    usdPerAnswer: null,
    secondsPerAnswer: null,
  });
  const row = {
    score: scoreItem({ criteria, marks: 4, expected: 1, mark: 1 }),
    usd: 0,
    seconds: 0,
  };
  expect(summarise([row])).toMatchObject({
    prosKept: null,
    consFixed: null,
    judgeMean: null,
  });
  expect(
    summarise([{ ...row, verdict: { pros: [], cons: [], score: 5 } }]),
  ).toMatchObject({ prosKept: null, consFixed: null, judgeMean: 5 });
});

it.each([
  [79.99, false],
  [80, true],
  [80.01, true],
])("blocks spend %s: %s", (spent, blocked) => {
  expect(evalBlocked(spent as number)).toBe(blocked);
});
