import { describe, expect, it } from "vitest";
import {
  averages,
  greeting,
  longDate,
  trend,
  weekCounts,
  type Marked,
} from "./home";

const m = (
  day: string,
  mark: number,
  max = 4,
  type: Marked["type"] = "short",
) => ({ day, mark, max, type }) as Marked;

describe("home", () => {
  it("greets by Sydney time of day", () => {
    // 9 Oct 2026: Sydney is UTC+11.
    expect(greeting(new Date("2026-10-08T22:00:00Z"))).toBe("Good morning");
    expect(greeting(new Date("2026-10-09T02:00:00Z"))).toBe("Good afternoon");
    expect(greeting(new Date("2026-10-09T07:00:00Z"))).toBe("Good evening");
  });
  it("formats the eyebrow date", () => {
    expect(longDate(new Date("2026-10-08T22:00:00Z"))).toBe("Friday 9 October");
  });
  it("counts questions Mon–Sun this week and last", () => {
    const days = [
      { day: "2026-10-04", questions: 7, cards: 0 }, // Sun last week
      { day: "2026-09-28", questions: 3, cards: 0 }, // Mon last week
      { day: "2026-10-05", questions: 2, cards: 4 }, // Mon this week
      { day: "2026-10-09", questions: 5, cards: 0 },
    ];
    expect(weekCounts(days, "2026-10-09")).toEqual({
      thisWeek: 7,
      lastWeek: 10,
    });
  });
  it("averages marks earned over 30-day windows", () => {
    const rows = [
      m("2026-10-09", 3),
      m("2026-09-10", 1),
      m("2026-09-01", 2),
      m("2026-07-01", 4),
    ];
    const { avg30, prev30 } = averages(rows, "2026-10-09");
    expect(avg30).toBeCloseTo(50);
    expect(prev30).toBe(50);
    expect(averages([], "2026-10-09")).toEqual({ avg30: null, prev30: null });
  });
  it("builds the daily trend, the shifted previous period and per-type %", () => {
    const rows = [
      m("2026-10-09", 1, 1, "mcq"),
      m("2026-10-09", 0, 1, "mcq"),
      m("2026-10-01", 3, 4),
      m("2026-09-05", 2, 4),
    ];
    const t = trend(rows, "2026-10-09", "30");
    expect(t.from).toBe("2026-09-10");
    expect(t.points).toEqual([
      { day: "2026-10-01", pct: 75 },
      { day: "2026-10-09", pct: 50 },
    ]);
    expect(t.previous).toEqual([{ day: "2026-10-05", pct: 50 }]);
    expect(t.byType).toEqual([
      { type: "mcq", pct: 50 },
      { type: "short", pct: 75 },
      { type: "extended", pct: null },
    ]);
    const all = trend(rows, "2026-10-09", "all");
    expect(all.from).toBe("2026-09-05");
    expect(all.points).toHaveLength(3);
    expect(all.previous).toEqual([]);
  });
});
