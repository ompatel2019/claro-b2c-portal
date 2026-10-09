import { expect, it } from "vitest";
import {
  clampTarget,
  DEFAULTS,
  estimateMinutes,
  filtersOn,
  fromParams,
  restore,
  summary,
  withMode,
  withSizeBy,
} from "./sprint";

const names = {
  t3: "Economic Issues",
  "t3-inflation": "Inflation",
  "t3-unemployment": "Unemployment",
  t4: "Economic Policies and Management",
};

it("switching type resets size to that type's default and range", () => {
  expect(withMode(DEFAULTS, "short")).toMatchObject({
    size_by: "marks",
    target: 30,
  });
  expect(withMode(DEFAULTS, "extended")).toMatchObject({
    size_by: "questions",
    target: 1,
  });
  const mixed = withMode(DEFAULTS, "mixed");
  expect(mixed).toMatchObject({ size_by: "marks", target: 45 });
  expect(withSizeBy(withMode(DEFAULTS, "short"), "questions").target).toBe(5);
  const short = { ...withMode(DEFAULTS, "short"), difficulty: ["standard"] };
  expect(withMode(short as typeof DEFAULTS, "mcq").difficulty).toEqual([]);
  expect(clampTarget(DEFAULTS, 99)).toBe(40);
  expect(clampTarget(withMode(DEFAULTS, "mixed"), 3)).toBe(20);
});

it("estimates time at HSC, relaxed and custom pace", () => {
  expect(estimateMinutes(DEFAULTS)).toBe(20);
  expect(estimateMinutes(withMode(DEFAULTS, "short"))).toBe(45);
  expect(
    estimateMinutes({ ...withMode(DEFAULTS, "short"), pace: "relaxed" }),
  ).toBe(68);
  expect(estimateMinutes({ ...DEFAULTS, mode: "extended", target: 2 })).toBe(
    70,
  );
  // Mixed 45: 18 MC (18 min) + 27 short marks (40.5 min) + extended 35.
  expect(
    estimateMinutes({ ...withMode(DEFAULTS, "mixed"), include_extended: true }),
  ).toBe(94);
  expect(
    estimateMinutes({ ...DEFAULTS, pace: "custom", custom_minutes: 25 }),
  ).toBe(25);
  expect(estimateMinutes({ ...DEFAULTS, timed: false })).toBeNull();
});

it("URL prefill wins and tolerates old subtopic links", () => {
  expect(fromParams({}, DEFAULTS)).toBeNull();
  expect(
    fromParams(
      { type: "short", sub: "t3-inflation", history: "prefer_new", size: "45" },
      DEFAULTS,
    ),
  ).toMatchObject({
    mode: "short",
    topics: ["t3"],
    subtopics: ["t3-inflation"],
    target: 45,
  });
  expect(fromParams({ topics: "t3-inflation" }, DEFAULTS)).toMatchObject({
    topics: ["t3"],
    subtopics: ["t3-inflation"],
  });
  const many = fromParams(
    { topics: "t1,t2,t3", size: "500", history: "x" },
    DEFAULTS,
  )!;
  expect(many.topics).toEqual(["t1", "t2"]);
  expect(many.target).toBe(40);
  expect(many.history).toBe("prefer_new");
  expect(fromParams({ verb: "Explain" }, DEFAULTS)!.verbs).toEqual([]);
});

it("restores a saved setup defensively", () => {
  expect(restore(null)).toEqual(DEFAULTS);
  expect(restore({ mode: "nope", target: 3 })).toMatchObject({
    mode: "mcq",
    target: 5,
  });
  expect(
    restore({
      ...withMode(DEFAULTS, "short"),
      size_by: "questions",
      target: 8,
    }),
  ).toMatchObject({ mode: "short", size_by: "questions", target: 8 });
});

it("summarises the setup in one line and counts extra filters", () => {
  const c = {
    ...withMode(DEFAULTS, "short"),
    topics: ["t3"],
    subtopics: ["t3-inflation", "t3-unemployment"],
    difficulty: ["foundation" as const],
    year_from: 2022,
  };
  expect(summary(c, names, [2018, 2025])).toBe(
    "30 marks · 45 min · Economic Issues (Inflation, Unemployment) · 2022–2025 · Prefer new",
  );
  expect(filtersOn(c)).toBe(2);
  expect(
    summary({ ...DEFAULTS, timed: false, history: "mistakes" }, names, null),
  ).toBe("20 questions · 20 marks · Untimed · Whole course · Mistakes only");
});

it("remembers the last size per type when switching back", () => {
  const mc5 = { ...DEFAULTS, target: 5 };
  const short = withMode(mc5, "short");
  expect(short.target).toBe(30);
  const back = withMode({ ...short, target: 45 }, "mcq");
  expect(back.target).toBe(5);
  expect(withMode(back, "short").target).toBe(45);
  const byQ = withSizeBy(
    { ...withMode(back, "short"), target: 50 },
    "questions",
  );
  expect(byQ.target).toBe(5);
  expect(withSizeBy({ ...byQ, target: 8 }, "marks").target).toBe(50);
  // Survives the saved setup, clamped to the type's range.
  expect(restore(JSON.parse(JSON.stringify(back))).sizes).toMatchObject({
    "mcq:questions": 5,
    "short:marks": 45,
  });
  expect(
    withMode(restore({ mode: "short", sizes: { "mcq:questions": 999 } }), "mcq")
      .target,
  ).toBe(40);
  expect(restore({ sizes: [1] }).sizes).toEqual({ "mcq:questions": 20 });
});
