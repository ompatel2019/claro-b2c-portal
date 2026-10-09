import { timer, type SprintConfig, type Topic } from "./practice";
import { markingState, type MarkingState, type ReviewRow } from "./feedback";

export const TYPE_LABEL = {
  mcq: "Multiple choice",
  short: "Short answer",
  extended: "Extended response",
};

/** Chip colour for a marked question: full, part or no marks. */
export const markTone = (mark: unknown, max: unknown) =>
  Number(mark) >= Number(max)
    ? "bg-success border-success text-white"
    : Number(mark) > 0
      ? "bg-warning border-warning text-white"
      : "bg-destructive border-destructive text-white";

const SCORED: MarkingState[] = [
  "marked",
  "in_review",
  "reviewed",
  "not_answered",
];
export const scored = (r: ReviewRow) => SCORED.includes(markingState(r));
const max = (r: Pick<ReviewRow, "max_marks" | "marks">) =>
  Number(r.max_marks ?? r.marks);
export const below = (r: ReviewRow) =>
  scored(r) && Number(r.mark ?? 0) < max(r);

type Tally = { mark: number; max: number };
const tally = (rows: ReviewRow[]): Tally => ({
  mark: rows.reduce((s, r) => s + Number(r.mark ?? 0), 0),
  max: rows.reduce((s, r) => s + max(r), 0),
});
export const pct = (t: Tally) => (t.max ? (t.mark / t.max) * 100 : null);

/** KPI tallies over scored questions only (marking/failed ones don't count yet). */
export function kpis(rows: ReviewRow[]) {
  const done = rows.filter(scored);
  return {
    score: tally(done),
    mc: tally(done.filter((r) => r.type === "mcq")),
    written: tally(done.filter((r) => r.type !== "mcq")),
    mcCount: rows.filter((r) => r.type === "mcq").length,
    writtenCount: rows.filter((r) => r.type !== "mcq").length,
  };
}

/** §3.4: open on the first question below full marks, else the first. */
export const firstBelow = (rows: ReviewRow[]) =>
  Math.max(0, rows.findIndex(below));

/** "32:10 of 45:00", "3:12 over time" or just "32:10" when untimed. */
export function timeMeta(elapsed: number, limit: number | null) {
  if (!limit) return timer(elapsed);
  return elapsed > limit
    ? `${timer(elapsed - limit)} over time`
    : `${timer(elapsed)} of ${timer(limit)}`;
}

/** "+6 pts vs your average" style caption; null when there's nothing to compare. */
export function delta(now: number | null, avg: number | null, unit = "%") {
  if (now == null || avg == null) return null;
  const d = Math.round(now - avg);
  if (d === 0) return "Same as your average";
  return `${d > 0 ? "+" : "−"}${Math.abs(d)}${unit} vs your average`;
}

/** Prefilled setup link for this sprint's type and topics, with extra params. */
export function sprintHref(
  c: SprintConfig,
  extra: Record<string, string> = {},
) {
  const p = new URLSearchParams({ type: c.mode });
  if (c.topics?.length) p.set("topics", c.topics.join(","));
  if (c.subtopics?.length) p.set("sub", c.subtopics.join(","));
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return `/student/sprint?${p}`;
}

const KINDS: Record<string, string> = {
  mcq: "multiple choice",
  short: "short answers",
  extended: "extended responses",
  mixed: "questions",
};
/**
 * Deterministic next-step actions (not AI): practise the weakest subtopics
 * (lowest share of marks, at least one mark lost) and review its flashcards.
 */
export function nextActions(
  rows: ReviewRow[],
  mode: SprintConfig["mode"],
  topics: Topic[],
  cards: Record<string, number>,
) {
  const by = new Map<string, ReviewRow[]>();
  for (const r of rows.filter(scored))
    if (r.topic_id) by.set(r.topic_id, [...(by.get(r.topic_id) ?? []), r]);
  const weak = [...by]
    .map(([id, rs]) => ({ id, t: tally(rs) }))
    .filter(({ t }) => t.mark < t.max)
    .sort((a, b) => pct(a.t)! - pct(b.t)! || a.id.localeCompare(b.id))
    .slice(0, 2);
  const name = (id: string) =>
    topics.find((t) => t.id === id)?.name ?? "this topic";
  const kind = KINDS[mode] ?? "questions";
  return [
    ...weak.map(({ id }) => ({
      label: `Practise ${name(id)} ${kind}`,
      href: `/student/sprint?type=${mode}&sub=${id}`,
    })),
    ...weak
      .slice(0, 1)
      .filter(({ id }) => cards[id])
      .map(({ id }) => ({
        label: `Review ${cards[id]} flashcard${cards[id] === 1 ? "" : "s"} on ${name(id)}`,
        href: `/student/flashcards?topic=${id}`,
      })),
  ];
}
