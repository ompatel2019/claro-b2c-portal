import { describe, expect, it } from "vitest";
import { ago, sydneyDay } from "./admin";

describe("admin helpers", () => {
  const now = new Date("2026-10-09T05:00:00Z");
  it("formats relative times for queues", () => {
    expect(ago("2026-10-09T04:59:30Z", now)).toBe("just now");
    expect(ago("2026-10-09T04:48:00Z", now)).toBe("12 min ago");
    expect(ago("2026-10-09T02:00:00Z", now)).toBe("3 h ago");
    expect(ago("2026-10-07T05:00:00Z", now)).toBe("2 d ago");
    expect(ago("2026-09-01T05:00:00Z", now)).toBe("1 Sept 2026");
  });

  it("uses Sydney calendar days across daylight saving", () => {
    expect(sydneyDay("2026-10-08T14:30:00Z")).toBe("2026-10-09");
    expect(sydneyDay("2026-07-08T14:30:00Z")).toBe("2026-07-09");
    expect(sydneyDay("2026-10-03T14:30:00Z")).toBe("2026-10-04");
  });
});

import { csv, pageOf, singleParams, tableParams } from "./admin";

it("normalises repeated, invalid and oversized paging parameters", () => {
  const fallback = { id: "last", dir: "desc" as const };
  expect(singleParams({ q: ["first", "second"] })).toEqual({ q: "first" });
  for (const page of ["0", "-1", "1.5", "NaN", "9007199254740992"])
    expect(tableParams({ page }, fallback).page).toBe(1);
  expect(tableParams({ dir: "invalid" }, fallback).sort).toEqual(fallback);
});

it("pages 50 rows, clamps pages, sorts nulls last and rejects prototype sort keys", () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({
    id: String(i).padStart(3, "0"),
    value: i === 0 ? null : i,
  }));
  const keys = { value: (r: (typeof rows)[number]) => r.value };
  const fallback = { id: "value", dir: "desc" as const };
  const first = pageOf(rows, keys, fallback, 1, fallback);
  expect(first.rows).toHaveLength(50);
  expect(first.rows[0].value).toBe(100);
  const last = pageOf(rows, keys, fallback, 999, fallback);
  expect(last.pager).toMatchObject({ page: 3, pages: 3, total: 101 });
  expect(last.rows[0].value).toBeNull();
  expect(
    pageOf(rows, keys, { id: "__proto__", dir: "asc" }, 1, fallback),
  ).toEqual(first);
  expect(pageOf([], keys, fallback, 1, fallback).pager.pages).toBe(1);
});

it("escapes CSV quotes, line breaks and formulas without changing numeric values", () => {
  expect(csv([["a,b", 'a"b', "a\nb", null, 0, -2, " =1+1", "@SUM(A1)"]])).toBe(
    '"a,b","a""b","a\nb",,0,-2,\' =1+1,\'@SUM(A1)',
  );
});
