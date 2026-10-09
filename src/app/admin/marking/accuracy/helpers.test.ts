import { expect, it } from "vitest";
import { evalAgreement, type EvalItem } from "./helpers";

const item = (overrides: Partial<EvalItem> = {}): EvalItem => ({
  section: "Held-out",
  marks: 6,
  expected: 3,
  mark: 4,
  ...overrides,
});

it.each(["held-out", "numeric"] as const)(
  "requires the same band as well as ±1 on 6+ in %s summaries",
  (scope) => {
    expect(
      evalAgreement([item({ score: { band: false } })], scope).agreement,
    ).toBe(0);
    expect(evalAgreement([item({ score: { band: true } })], scope)).toEqual({
      n: 1,
      exact: 0,
      agreement: 1,
    });
    expect(
      evalAgreement([item({ mark: 5, score: { band: true } })], scope)
        .agreement,
    ).toBe(0);
    expect(evalAgreement([item()], scope).agreement).toBe(0);
    expect(evalAgreement([item({ mark: 3 })], scope).agreement).toBe(1);
    expect(
      evalAgreement([item({ mark: 3, score: { band: false } })], scope)
        .agreement,
    ).toBe(0);
  },
);
it("allows same-band non-exact marks under 6, and measures range distance on 6+", () => {
  expect(
    evalAgreement([item({ marks: 5, score: { band: true } })]).agreement,
  ).toBe(1);
  expect(
    evalAgreement([
      item({ expected: [2, 3], mark: 1, score: { band: true } }),
      item({ expected: [2, 3], mark: 4, score: { band: true } }),
      item({ expected: [2, 3], mark: 5, score: { band: true } }),
      item({ expected: [2, 3], mark: 2.5 }),
    ]),
  ).toEqual({ n: 4, exact: 1 / 4, agreement: 3 / 4 });
});
