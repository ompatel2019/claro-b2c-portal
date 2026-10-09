import { expect, it } from "vitest";
import { calculate } from "./calc";

it("follows precedence, parentheses, unary minus and percent", () => {
  expect(calculate("2+3×4")).toBe(14);
  expect(calculate("(2+3)×4")).toBe(20);
  expect(calculate("−3+5")).toBe(2);
  expect(calculate("10÷4")).toBe(2.5);
  expect(calculate("50%×200")).toBe(100);
  expect(calculate("√16+1")).toBe(5);
  expect(calculate("0.1+0.2")).toBe(0.3);
  expect(calculate("Ans×2", 21)).toBe(42);
});
it("rejects anything that isn't arithmetic", () => {
  expect(() => calculate("alert(1)")).toThrow("Check your expression");
  expect(() => calculate("2+")).toThrow();
  expect(() => calculate("(2+3")).toThrow("Missing )");
  expect(() => calculate("1÷0")).toThrow("Can’t divide by zero");
  expect(() => calculate("√−4")).toThrow();
});
