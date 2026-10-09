import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  compareRuns,
  indexedItems,
  itemResult,
  validRunIds,
  type CompareItem,
  type CompareRun,
} from "./compare";
import { mergeRuns } from "./summary";
const item = (
  mark: number | null,
  options: Partial<CompareItem> = {},
): CompareItem => ({
  id: "q",
  section: "A1",
  marks: 5,
  expected: 3,
  mark,
  ...options,
});
const run = (
  items: CompareItem[],
  options: Partial<CompareRun["meta"]> = {},
): CompareRun => ({
  meta: {
    stamp: "2026-10-09-0901",
    label: "test",
    marker: { model: "test" },
    ...options,
  },
  items,
});
it("matches by section, id and label regardless of order; reports unmatched counts", () => {
  const result = compareRuns(
    run([
      item(3),
      item(2, { section: "Claro", label: "weak" }),
      item(3, { id: "only-a" }),
    ]),
    run([
      item(4, { section: "Claro", label: "weak" }),
      item(3),
      item(1, { id: "only-b" }),
    ]),
  );
  expect(result.rows).toHaveLength(2);
  expect(result.rows.map((row) => row.equal)).toEqual([true, false]);
  expect(result).toMatchObject({
    onlyA: 1,
    onlyB: 1,
    differing: 1,
    a: { n: 2, exact: 0.5, agreement: 0.5 },
    b: { n: 2, exact: 0.5, agreement: 0.5 },
  });
});
it("keeps repeated full-run answers and omits ambiguous subsets", () => {
  const full = run([
    item(2, { section: "Held-out" }),
    item(3, { section: "Held-out" }),
  ]);
  expect(compareRuns(full, full).rows.map((row) => row.occurrence)).toEqual([
    0, 1,
  ]);
  expect(
    compareRuns(full, run(full.items.slice(1), { items: [22] })),
  ).toMatchObject({ rows: [], onlyA: 2, onlyB: 1 });
  expect(
    compareRuns(
      run(full.items.slice(0, 1), { items: [21] }),
      run(full.items.slice(1), { items: [22] }),
    ).rows,
  ).toEqual([]);
});
it.each([
  [1, -1],
  [2, 0],
  [3, 0],
  [4, 1],
])("computes signed distance to a range for mark %i", (mark, delta) => {
  expect(itemResult(item(mark, { expected: [2, 3] })).delta).toBe(delta);
});
it("uses band and distance agreement, while run equality requires equal marks", () => {
  const result = compareRuns(
    run([item(3, { marks: 6, score: { band: true } })]),
    run([item(4, { marks: 6, score: { band: true } })]),
  );
  expect(result.rows[0]).toMatchObject({
    equal: false,
    a: { agrees: true },
    b: { agrees: true, delta: 1 },
  });
  expect(itemResult(item(5, { marks: 6, score: { band: true } })).agrees).toBe(
    false,
  );
  expect(itemResult(item(3, { score: { band: false } })).agrees).toBe(false);
  expect(itemResult(item(4))).toMatchObject({ delta: 1, agrees: false });
});
it("renders states and excludes them from metrics even with a cached mark", () => {
  const a = run([
    item(3, { flags: { excluded: "legacy" } }),
    item(3, { id: "error", error: "failed" }),
    item(null, { id: "null" }),
  ]);
  const result = compareRuns(a, a);
  expect(result.rows.map((row) => row.a.state)).toEqual([
    "Excluded",
    "Errored",
    "Unmarked",
  ]);
  expect(
    result.rows.every((row) => row.a.mark === null && row.equal === null),
  ).toBe(true);
  expect(result.a).toEqual({ n: 0, exact: null, agreement: null });
  expect(itemResult(item(NaN)).state).toBe("Unmarked");
  expect(itemResult(item(3, { expected: [3, 2] })).delta).toBeNull();
});
it("validates distinct known ids and rejects traversal, encoded paths and arrays", () => {
  const ids = new Set(["2026-10-09-0901", "web-id", "../escape"]);
  expect(validRunIds("2026-10-09-0901", "web-id", ids)).toBe(true);
  for (const bad of [
    "../escape",
    "%2e%2e%2fescape",
    "unknown",
    "web-id.json",
    "web/id",
    ["web-id"],
    undefined,
  ])
    expect(validRunIds(bad, "web-id", ids)).toBe(false);
  expect(validRunIds("web-id", "web-id", ids)).toBe(false);
});
it("uses file stamps and bucket ids independent of sorting position", () => {
  expect(
    mergeRuns(
      [run([])],
      [run([], { id: "web-id", stamp: "2026-10-09-0902" })],
    ).map((row) => row.id),
  ).toEqual(["web-id", "2026-10-09-0901"]);
});

it("compares all 226 items in the newest full CLI runs without collapsing repeated questions", () => {
  const load = (stamp: string) =>
    JSON.parse(
      readFileSync(`src/lib/ai/eval/results/${stamp}.json`, "utf8"),
    ) as CompareRun;
  const result = compareRuns(load("2026-10-09-1415"), load("2026-10-09-1358"));
  expect(result.rows).toHaveLength(226);
  expect(new Set(result.rows.map((row) => row.key)).size).toBe(226);
  expect(result.onlyA).toBe(0);
  expect(result.onlyB).toBe(0);
  expect(result.differing).toBeGreaterThan(0);
  expect(result.differing).toBeLessThan(226);
  expect(JSON.stringify(result)).not.toContain("feedback");
});

it("compares the three real --items regression rows by original full-array index", () => {
  const load = (stamp: string) =>
    JSON.parse(
      readFileSync(`src/lib/ai/eval/results/${stamp}.json`, "utf8"),
    ) as CompareRun;
  const a = load("2026-10-09-1439"),
    b = load("2026-10-09-1440");
  expect(a.meta.items).toEqual([114, 209, 222]);
  expect(compareRuns(a, b)).toMatchObject({
    rows: expect.any(Array),
    onlyA: 0,
    onlyB: 0,
  });
  expect(compareRuns(a, b).rows).toHaveLength(3);
  expect(compareRuns(a, load("2026-10-09-1415")).rows).toHaveLength(3);
});
it("matches real --limit section prefixes to full and --items runs by original index", () => {
  const load = (stamp: string) =>
    JSON.parse(
      readFileSync(`src/lib/ai/eval/results/${stamp}.json`, "utf8"),
    ) as CompareRun;
  const limited = load("2026-10-09-1414"),
    full = load("2026-10-09-1415");
  expect(limited.meta.limit).toBe(1);
  expect(indexedItems(limited)[1].originalIndex).toBe(20);
  expect(compareRuns(limited, full)).toMatchObject({
    rows: expect.any(Array),
    onlyA: 0,
    onlyB: 223,
  });
  const indices = [0, 20, 216];
  const subset = {
    ...full,
    meta: { ...full.meta, items: indices },
    items: indices.map((index) => full.items[index]),
  };
  expect(compareRuns(subset, limited).rows).toHaveLength(3);
  expect(compareRuns(limited, subset).rows).toHaveLength(3);
  // The next Held-out answer has the same question id, but is not in --limit=1.
  expect(full.items[21].id).toBe(limited.items[1].id);
  const nextAnswer = {
    ...full,
    meta: { ...full.meta, items: [21] },
    items: [full.items[21]],
  };
  expect(compareRuns(nextAnswer, limited).rows).toHaveLength(0);
  expect(compareRuns(limited, nextAnswer).rows).toHaveLength(0);
  expect(compareRuns(limited, load("2026-10-09-1439")).rows).toHaveLength(0);
});
it("uses stable example identities over ordering and subset indices", () => {
  const items = ["one", "two"].map((exampleId, index) =>
    item(index, { section: "Held-out", exampleId }),
  );
  const result = compareRuns(
    run(items, { items: [1, 2] }),
    run([...items].reverse(), { items: [3, 4] }),
  );
  expect(result.rows.map((row) => row.equal)).toEqual([true, true]);
  expect(compareRuns(run([items[0]]), run([items[1]])).rows).toHaveLength(0);
});

it("normalises unsorted duplicate CLI indices and compares legacy repeats by occurrence", () => {
  const items = [
    item(2, { section: "Held-out" }),
    item(3, { section: "Held-out" }),
  ];
  expect(
    compareRuns(
      run(items, { items: [22, 21, 22] }),
      run(items, { items: [21, 22] }),
    ).rows,
  ).toHaveLength(2);
  expect(compareRuns(run(items), run(items.slice(0, 1))).rows).toHaveLength(1);
});
