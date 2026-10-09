import { expect, it } from "vitest";
import { wordGuide } from "./limits";

it("sizes the word guide by marks: tight for 1-3 marks, 35-50 words a mark from 4", () => {
  expect(wordGuide(1)).toEqual([10, 20]);
  expect(wordGuide(2)).toEqual([25, 45]);
  expect(wordGuide(3)).toEqual([60, 90]);
  expect(wordGuide(4)).toEqual([140, 200]);
  expect(wordGuide(15)).toEqual([525, 750]);
  expect(wordGuide(0)).toEqual([10, 20]);
});
it("never asks for fewer words as marks go up", () => {
  for (let m = 1; m < 25; m++) {
    const [a, b] = wordGuide(m);
    const [c, d] = wordGuide(m + 1);
    expect(c).toBeGreaterThanOrEqual(a);
    expect(d).toBeGreaterThanOrEqual(b);
  }
});
