import { addDays } from "./activity";
import type { Topic } from "./practice";

export const PROGRESS_RANGES = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
] as const;
export type ProgressRange = (typeof PROGRESS_RANGES)[number]["value"];
export function parseRange(
  value: string | string[] | undefined,
): ProgressRange {
  return PROGRESS_RANGES.some((r) => r.value === value)
    ? (value as ProgressRange)
    : "90";
}
export function rangeFrom(range: ProgressRange, today: string) {
  return range === "all"
    ? null
    : range === "year"
      ? `${today.slice(0, 4)}-01-01`
      : addDays(today, 1 - Number(range));
}
export type TopicProgress = Topic & {
  answered: number;
  earned: number;
  possible: number;
  pct: number | null;
  last_answered: string | null;
};
export type Breakdown = {
  id: string;
  answered: number;
  pct: number | null;
  earned?: number;
  possible?: number;
};
export type HistoryScore = {
  id: string;
  kind: string;
  config: { mode?: string; topics?: string[]; subtopics?: string[] };
  finished_at: string;
  elapsed_s: number;
  pct: number | null;
  by_type: Record<string, number>;
};
export type Mastery = {
  id: string;
  known: number;
  learning: number;
  missed: number;
  new: number;
};
export type ProgressData = {
  stats: {
    answered: number;
    earned: number;
    possible: number;
    pct: number | null;
    active: number;
  };
  topics: TopicProgress[];
  types: Breakdown[];
  verbs: Breakdown[];
  history: HistoryScore[];
  mastery: Mastery[];
  missed: { id: string; name: string; missed: number }[];
  due: { day: string; count: number }[];
};
export function reportHref(s: Pick<HistoryScore, "id" | "kind">) {
  return s.kind === "single"
    ? `/student/activity/${s.id}`
    : s.kind === "flashcards"
      ? `/student/flashcards/${s.id}`
      : s.kind === "sprint"
        ? `/student/sprint/${s.id}/results`
        : null;
}
export function practiseHref(
  t: Pick<Topic, "id" | "parent_id">,
  mistakes = false,
) {
  const p = new URLSearchParams(
    t.parent_id ? { topics: t.parent_id, sub: t.id } : { topics: t.id },
  );
  if (mistakes) p.set("history", "mistakes");
  return `/student/sprint?${p}`;
}
export function verbRows(rows: Breakdown[]) {
  return rows
    .filter((r) => r.answered >= 3 && r.pct !== null)
    .sort((a, b) => a.pct! - b.pct! || a.id.localeCompare(b.id));
}
export function weakSpots(
  topics: TopicProgress[],
  cards: ProgressData["missed"],
) {
  const questions = topics
    .filter(
      (t) => t.parent_id && t.answered >= 3 && t.pct !== null && t.pct < 60,
    )
    .sort(
      (a, b) =>
        a.pct! - b.pct! || b.answered - a.answered || a.id.localeCompare(b.id),
    );
  const missed = cards
    .filter((c) => c.missed > 0)
    .sort((a, b) => b.missed - a.missed || a.id.localeCompare(b.id));
  // Alternate the two ranked lists so card weaknesses remain visible alongside marks.
  return Array.from(
    { length: Math.max(questions.length, missed.length) },
    (_, i) => [
      ...(questions[i]
        ? [
            {
              id: `q-${questions[i].id}`,
              name: questions[i].name,
              caption: `${Math.round(questions[i].pct!)}% · ${questions[i].answered} answered`,
              href: practiseHref(questions[i], true),
              action: "Practise",
            },
          ]
        : []),
      ...(missed[i]
        ? [
            {
              id: `c-${missed[i].id}`,
              name: missed[i].name,
              caption: `${missed[i].missed} cards to revisit`,
              href: `/student/flashcards?topic=${encodeURIComponent(missed[i].id)}`,
              action: "Review cards",
            },
          ]
        : []),
    ],
  )
    .flat()
    .slice(0, 6);
}
/** Normalise the SQL counts for the CategoryBar; empty categories never divide by zero. */
export function masterySegments(m: Mastery) {
  const total = m.known + m.learning + m.missed + m.new;
  return (
    [
      ["Known", m.known],
      ["Learning", m.learning],
      ["Missed", m.missed],
      ["New", m.new],
    ] as const
  ).map(([label, count]) => ({
    label,
    count,
    width: total ? (count / total) * 100 : 0,
  }));
}
