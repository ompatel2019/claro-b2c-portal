import type { ReviewRow } from "./feedback";
import { describe, expect, it } from "vitest";
import {
  calendarDate,
  filterSessions,
  safeLocalPath,
  ownQuestionReview,
  filterStudents,
  sessionKind,
  sessionItems,
  sessionStatus,
  sessionTitle,
  studentsCsv,
  type SessionRow,
  type StudentRow,
} from "./students";

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

  it("titles, counts and classifies sessions like the student activity table", () => {
    const topics = [
      { id: "t3", parent_id: null, name: "Economic Issues", sort: 3 },
      { id: "t3-inflation", parent_id: "t3", name: "Inflation", sort: 1 },
    ];
    const s: SessionRow = {
      id: "s",
      kind: "sprint",
      config: { mode: "short", topics: ["t3"], subtopics: ["t3-inflation"] },
      started_at: "2026-10-09T00:00:00Z",
      finished_at: null,
      score: null,
      max_score: null,
      elapsed_s: 0,
      attempts: [
        { status: "pending", check_status: "skipped" },
        { status: "pending", check_status: "skipped" },
      ],
    };
    expect(sessionTitle(s, topics)).toBe("Short answer sprint · Inflation");
    expect(sessionItems(s)).toBe("2 questions");
    expect(sessionStatus(s)).toBe("In progress");
    const done = { ...s, finished_at: "2026-10-09T01:00:00Z" };
    expect(sessionStatus(done)).toBe("Marking");
    expect(
      sessionStatus({
        ...done,
        attempts: [
          { status: "marked", check_status: "agreed" },
          { status: "skipped", check_status: "skipped" },
        ],
      }),
    ).toBe("Finished");
    expect(
      sessionStatus({
        ...done,
        attempts: [{ status: "marked", check_status: "in_review" }],
      }),
    ).toBe("Provisional");
    const cards: SessionRow = {
      ...s,
      kind: "flashcards",
      config: { mode: "test", card_ids: ["a", "b", "c"] },
    };
    expect(sessionTitle(cards, topics)).toBe("Flashcards · Test");
    expect(sessionItems(cards)).toBe("3 cards");
    expect(sessionTitle({ ...s, kind: "single" }, topics)).toBe(
      "Mark my answer",
    );
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

it("keeps marked answers with pending checks in the Marking state", () => {
  expect(
    sessionStatus({
      finished_at: "2026-10-09",
      attempts: [{ status: "marked", check_status: "pending" }],
    } as SessionRow),
  ).toBe("Marking");
});
it("accepts real dates and rejects impossible dates", () => {
  expect(calendarDate("2024-02-29")).toBe("2024-02-29");
  for (const value of [
    undefined,
    "2026-02-29",
    "2026-13-01",
    "2026-10-32",
    "tomorrow",
  ])
    expect(calendarDate(value)).toBeNull();
});
it("filters a marked day even when a session started and finished on another day", () => {
  const row = {
    id: "s",
    kind: "sprint",
    config: { subtopics: ["inflation"] },
    started_at: "2026-10-07",
    finished_at: "2026-10-08",
    attempts: [{ status: "marked", check_status: "agreed", day: "2026-10-09" }],
  } as SessionRow;
  expect(
    filterSessions(
      [row],
      {
        date: "2026-10-09",
        topic: "inflation",
        status: "Finished",
        kind: "sprint",
      },
      dayOf,
    ),
  ).toEqual([row]);
  expect(filterSessions([row], { date: "2026-10-06" }, dayOf)).toEqual([]);
  expect(filterSessions([row], { status: "Marking" }, dayOf)).toEqual([]);
});
it("allows local feedback context links and rejects script, external and disguised URLs", () => {
  expect(safeLocalPath("/student/sprint?id=1")).toBe("/student/sprint?id=1");
  for (const path of [
    null,
    "https://evil.example",
    "javascript:alert(1)",
    "//evil.example",
    "/\\evil.example",
    "/\nevil.example",
  ])
    expect(safeLocalPath(path)).toBeNull();
});

it("restores own-question context without inventing a marking band or replacing bank questions", () => {
  const row = { question_id: null, max_marks: 6 } as ReviewRow;
  expect(
    ownQuestionReview(row, { stem: "Explain inflation", marks: 6 }),
  ).toMatchObject({
    type: "short",
    source: "Own question",
    stem: "Explain inflation",
    marks: 6,
    criteria: null,
  });
  const bank = { ...row, question_id: "q" };
  expect(ownQuestionReview(bank, { stem: "Other" })).toBe(bank);
});

it("labels removed session kinds without treating them as answer checks", () => {
  expect(sessionKind("paper")).toBe("Removed session");
  expect(sessionKind("unknown")).toBe("Removed session");
  expect(sessionKind("single")).toBe("Mark my answer");
});
