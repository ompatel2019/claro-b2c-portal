import { describe, expect, it } from "vitest";
import { filterStudents, studentsCsv, type StudentRow } from "./students";

const base: StudentRow = {
  id: "a",
  full_name: "Ada Lovelace",
  email: "ada@example.com",
  year_level: 12,
  school: null,
  joined: "2026-01-01T00:00:00Z",
  last_active: "2026-10-08T00:00:00Z",
  sessions_7d: 2,
  sessions_total: 9,
  answered: 40,
  avg_30: 71,
  streak: 3,
  open_disputes: 1,
  ai_spend: 1.23456,
  blocked: false,
};
const rows: StudentRow[] = [
  base,
  {
    ...base,
    id: "b",
    full_name: "Bob",
    email: "bob@example.com",
    year_level: 11,
    last_active: "2026-09-01T00:00:00Z",
    open_disputes: 0,
  },
  { ...base, id: "c", full_name: null, email: "c@x.io", last_active: null },
];
const dayOf = (iso: string) => iso.slice(0, 10);

describe("students", () => {
  it("filters by search, year, activity and open disputes", () => {
    const today = "2026-10-09";
    const ids = (f: Parameters<typeof filterStudents>[1]) =>
      filterStudents(rows, f, dayOf, today).map((r) => r.id);
    expect(ids({ q: "BOB" })).toEqual(["b"]);
    expect(ids({ q: "x.io" })).toEqual(["c"]);
    expect(ids({ year: "11" })).toEqual(["b"]);
    expect(ids({ activity: "active7" })).toEqual(["a"]);
    expect(ids({ activity: "active30" })).toEqual(["a"]);
    expect(ids({ activity: "inactive30" })).toEqual(["b"]);
    expect(ids({ activity: "never" })).toEqual(["c"]);
    expect(ids({ disputes: "1" })).toEqual(["a", "c"]);
  });

  it("exports the visible columns as CSV", () => {
    const text = studentsCsv([base]);
    expect(text.split("\r\n")[0]).toMatch(/^Name,Email,Year/);
    expect(text).toContain("Ada Lovelace,ada@example.com,12,,");
    expect(text).toContain(",1.2346,no");
  });
});

it("uses Sydney calendar boundaries and searches IDs and school", () => {
  const student = {
    ...base,
    id: "unique-id",
    school: "Claro school",
    last_active: "2026-10-02T14:00:00Z",
  };
  const sydneyDay = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(
      new Date(iso),
    );
  expect(
    filterStudents([student], { activity: "active7" }, sydneyDay, "2026-10-09"),
  ).toHaveLength(1);
  expect(
    filterStudents([student], { q: "unique-id" }, sydneyDay, "2026-10-09"),
  ).toHaveLength(1);
  expect(
    filterStudents([student], { q: "claro school" }, sydneyDay, "2026-10-09"),
  ).toHaveLength(1);
  expect(
    filterStudents(
      [{ ...base, last_active: "2026-09-10T00:00:00Z" }],
      { activity: "inactive30" },
      dayOf,
      "2026-10-09",
    ),
  ).toHaveLength(0);
});
