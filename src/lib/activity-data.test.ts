import { expect, it, vi } from "vitest";
import { studentActivity } from "./activity-data";
import {
  parseActivityFilters,
  type ActivityData,
  type ActivityRow,
} from "./activity-filters";
const row = (id: string, kind = "sprint", pct = 50): ActivityRow => ({
  id,
  kind,
  title: id,
  status: "Finished",
  provisional: false,
  study: false,
  pct,
  items: 2,
  answered: 2,
  elapsed_s: 10,
  started_at: "2026-10-09",
  finished_at: "2026-10-09",
});
it("repages legacy rows without losing supported sessions or counting their marks", async () => {
  const rows = [
    row("old", "paper", 100),
    ...Array.from({ length: 20 }, (_, i) => row(`s${i}`)),
    row("check", "single", 80),
    row("cards", "flashcards", 70),
  ];
  const read = vi.fn(async (page: number): Promise<ActivityData> => ({
    rows: rows.slice((page - 1) * 20, page * 20),
    total: 23,
    all_total: 23,
    page,
    kind_total: 23,
    kinds: { paper: 1, sprint: 20, single: 1, flashcards: 1 },
    stats: { sessions: 23, questions: 44, average: 100, best: 100 },
  }));
  const data = await studentActivity(
    parseActivityFilters({ page: "2" }, "2026-10-09"),
    read,
    22,
  );
  expect(data.rows.map((r) => r.id)).toEqual(["check", "cards"]);
  expect(data).toMatchObject({
    total: 22,
    all_total: 22,
    kind_total: 22,
    page: 2,
    kinds: { sprint: 20, single: 1, flashcards: 1 },
    stats: { sessions: 22, questions: 42, best: 80 },
  });
  expect(data.kinds).not.toHaveProperty("paper");
  expect(data.stats.average).toBeCloseTo(1150 / 22);
  expect(read).toHaveBeenCalledTimes(2);
});
it("keeps kind-filtered sprint statistics and removes legacy kinds from counts", async () => {
  const data: ActivityData = {
    rows: [row("s")],
    total: 1,
    all_total: 2,
    page: 1,
    kind_total: 2,
    kinds: { sprint: 1, paper: 1 },
    stats: { sessions: 1, questions: 2, average: 50, best: 50 },
  };
  const read = vi.fn(async () => data);
  expect(
    await studentActivity(
      parseActivityFilters({ kind: "sprint" }, "2026-10-09"),
      read,
      1,
    ),
  ).toMatchObject({
    rows: data.rows,
    stats: data.stats,
    kinds: { sprint: 1 },
    kind_total: 1,
    all_total: 1,
  });
  expect(read).toHaveBeenCalledOnce();
});
