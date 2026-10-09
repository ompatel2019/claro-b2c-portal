import { expect, it } from "vitest";
import { paperListPage } from "./paper-list";
import type { PaperListRow } from "./admin-papers";
const row: PaperListRow = {
  id: "p1",
  title: "Trial",
  year: 2026,
  source: "HSC",
  origin: "a1",
  questions: 22,
  total_marks: 100,
  time_limit_min: 180,
  status: "draft",
  first_sits: 2,
  all_sits: 3,
  avg: 75,
  ranks_enabled: true,
  updated_at: "2026-10-09T01:00:00Z",
};
it("searches every visible text column and ID", () => {
  for (const q of [
    "p1",
    "TRIAL",
    "2026",
    "hsc",
    "A1",
    "22",
    "100",
    "180 min",
    "draft",
    "2 / 3",
    "75%",
    "On",
    "Fri 9 Oct",
  ])
    expect(paperListPage([row], { q }).pager.total).toBe(1);
  expect(paperListPage([row], { status: "live" }).pager.total).toBe(0);
  expect(
    paperListPage([{ ...row, avg: null }], { q: "No marks yet" }).pager.total,
  ).toBe(1);
  expect(
    paperListPage([{ ...row, avg: null, all_sits: 0 }], { q: "No sits" }).pager
      .total,
  ).toBe(1);
});
it("sorts and clamps server pages, even above 1000 rows", () => {
  const rows = Array.from({ length: 1001 }, (_, n) => ({
    ...row,
    id: `p${n}`,
    all_sits: n,
  }));
  const result = paperListPage(rows, { sort: "sits", dir: "desc", page: "99" });
  expect(result.pager).toMatchObject({ total: 1001, pages: 21, page: 21 });
  expect(result.rows.map((r) => r.all_sits)).toEqual([0]);
  expect(
    paperListPage([row], { sort: "__proto__", page: "NaN" }).pager.sort,
  ).toEqual({ id: "updated", dir: "desc" });
});
