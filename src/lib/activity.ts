import { plural } from "./practice";

/** One row of activity_days(): a Sydney day with questions answered and flashcards reviewed. */
export type ActivityDay = { day: string; questions: number; cards: number };

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const addDays = (iso: string, n: number) =>
  new Date(utc(iso).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** 53 Monday-first weeks ending with today's week; days after today are null. */
export function heatmapWeeks(today: string) {
  const monday = addDays(today, -((utc(today).getUTCDay() + 6) % 7));
  const start = addDays(monday, -52 * 7);
  return Array.from({ length: 53 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = addDays(start, w * 7 + d);
      return day > today ? null : day;
    }),
  );
}

/** Month name over the first week that starts in that month. */
export function monthLabels(weeks: (string | null)[][]) {
  return weeks.flatMap((week, col) => {
    const month = week[0]!.slice(0, 7);
    return col === 0 || month !== weeks[col - 1][0]!.slice(0, 7)
      ? [
          {
            col,
            label: utc(week[0]!)
              .toLocaleString("en-AU", { month: "short", timeZone: "UTC" })
              .slice(0, 3),
          },
        ]
      : [];
  });
}

export const SHADES = ["#F2EEEE", "#FCD9CC", "#F99576", "#F76F43", "#F54F1B"];
export const SHADE_LABELS = [
  "No activity",
  "1 to 5",
  "6 to 15",
  "16 to 30",
  "31 or more",
];
/** Fixed buckets so shades compare over time: 0, 1–5, 6–15, 16–30, 31+. */
export const shade = (count: number) =>
  count === 0 ? 0 : count <= 5 ? 1 : count <= 15 ? 2 : count <= 30 ? 3 : 4;

/** "Thu 8 Oct 2026 · 14 questions · 20 flashcards", or "… · No activity". */
export function dayLabel(iso: string, questions = 0, cards = 0) {
  const [weekday, day, month, year] = utc(iso)
    .toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
    .replace(",", "")
    .split(" ");
  const parts = [
    questions && plural(questions, "question"),
    cards && plural(cards, "flashcard"),
  ].filter(Boolean);
  return [
    `${weekday} ${day} ${month} ${year}`,
    ...(parts.length ? parts : ["No activity"]),
  ].join(" · ");
}
