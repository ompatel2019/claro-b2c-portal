import { describe, expect, it } from "vitest";
import {
  addDays,
  dayLabel,
  heatmapWeeks,
  monthLabels,
  shade,
} from "./activity";

describe("activity heatmap", () => {
  it("builds 53 Monday-first weeks ending with today's week", () => {
    const weeks = heatmapWeeks("2026-10-08"); // a Thursday
    expect(weeks).toHaveLength(53);
    expect(weeks.at(-1)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      null,
      null,
      null,
    ]);
    expect(weeks[0][0]).toBe("2025-10-06");
    expect(new Date(`${weeks[0][0]}T00:00:00Z`).getUTCDay()).toBe(1);
    const sunday = heatmapWeeks("2026-10-11");
    expect(sunday.at(-1)!.every(Boolean)).toBe(true);
  });
  it("labels each month once, over its first week", () => {
    const labels = monthLabels(heatmapWeeks("2026-10-08"));
    expect(labels[0]).toEqual({ col: 0, label: "Oct" });
    expect(labels.map((l) => l.label)).toContain("Jan");
    expect(new Set(labels.map((l) => l.col)).size).toBe(labels.length);
  });
  it("uses fixed shade buckets", () => {
    expect([0, 1, 5, 6, 15, 16, 30, 31, 200].map(shade)).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });
  it("formats the tooltip", () => {
    expect(dayLabel("2026-10-08", 14, 20)).toBe(
      "Thu 8 Oct 2026 · 14 questions · 20 flashcards",
    );
    expect(dayLabel("2026-10-08", 1)).toBe("Thu 8 Oct 2026 · 1 question");
    expect(dayLabel("2026-10-08")).toBe("Thu 8 Oct 2026 · No activity");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
