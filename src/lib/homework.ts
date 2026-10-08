import { answered, type Attempt, type Session } from "./practice";
import type { FlashcardReview } from "./flashcards";
export type HomeworkItem = {
  position: number;
  flashcard_id: string | null;
  question_id: string | null;
  card?: {
    id: string;
    front: string;
    back: string;
    topic_id: string;
    kind: "term" | "stat";
  } | null;
  question?: Attempt["question"] | null;
};
export type HomeworkSet = {
  id: string;
  title: string;
  topic_id: string | null;
  due_at: string;
  published_at: string | null;
  items: HomeworkItem[];
  topic?: { name: string } | null;
};
type Review = Pick<FlashcardReview, "flashcard_id" | "mark" | "created_at">;
export function latestReviews(reviews: readonly Review[]) {
  const latest = new Map<string, Review>();
  for (const r of reviews)
    if (
      !latest.has(r.flashcard_id) ||
      r.created_at >= latest.get(r.flashcard_id)!.created_at
    )
      latest.set(r.flashcard_id, r);
  return latest;
}
export function stageOneComplete(
  cardIds: readonly string[],
  reviews: readonly Review[],
) {
  const latest = latestReviews(reviews);
  return cardIds.every((id) => latest.get(id)?.mark === 1);
}
export function stageOneQueue(
  cardIds: readonly string[],
  reviews: readonly Review[],
) {
  const latest = latestReviews(reviews);
  return [
    ...cardIds.filter((id) => !latest.has(id)),
    ...cardIds.filter((id) => latest.has(id) && latest.get(id)!.mark !== 1),
  ];
}
export function cardIds(set: HomeworkSet) {
  return set.items.flatMap((i) => (i.flashcard_id ? [i.flashcard_id] : []));
}
export function homeworkStatus({
  set,
  session,
  attempts,
  reviews,
  now = new Date(),
}: {
  set: HomeworkSet;
  session?: Pick<Session, "finished_at"> | null;
  attempts: Pick<Attempt, "choice_index" | "answer_text" | "transcript">[];
  reviews: readonly Review[];
  now?: Date;
}) {
  const ids = cardIds(set);
  const right = ids.length - stageOneQueue(ids, reviews).length;
  const stageText = stageOneComplete(ids, reviews)
    ? `${attempts.filter(answered).length} of ${set.items.filter((i) => i.question_id).length} questions answered`
    : `Flashcards ${right} of ${ids.length} right`;
  const status = session?.finished_at
    ? "submitted"
    : new Date(set.due_at) < now
      ? "overdue"
      : session
        ? "in_progress"
        : "not_started";
  return { status, stageText } as const;
}
export function estimateMinutes(items: readonly HomeworkItem[]) {
  const minutes = items.reduce(
    (n, i) =>
      n +
      (i.flashcard_id
        ? 0.5
        : i.question?.type === "mcq"
          ? 1.5
          : 2 * (i.question?.marks ?? 0)),
    0,
  );
  return Math.ceil(minutes / 5) * 5;
}
export function homeworkCounts(items: readonly HomeworkItem[]) {
  return {
    cards: items.filter((i) => i.flashcard_id).length,
    mc: items.filter((i) => i.question?.type === "mcq").length,
    written: items.filter((i) => i.question && i.question.type !== "mcq")
      .length,
    marks: items.reduce((n, i) => n + (i.question?.marks ?? 0), 0),
  };
}
export function dueLabel(date: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(date));
}
export function daysLeft(date: string, now = new Date()) {
  const days = Math.ceil((new Date(date).getTime() - now.getTime()) / 86400000);
  return new Date(date).getTime() < now.getTime()
    ? "Overdue"
    : days === 0
      ? "Due today"
      : `${days} ${days === 1 ? "day" : "days"} left`;
}
/** Convert a Sydney wall-clock input, respecting daylight saving for its date. */
export function sydneyDateTime(value: string) {
  const wall = new Date(`${value}Z`);
  if (!Number.isFinite(wall.getTime()))
    throw new Error("Choose a valid due date and time.");
  let instant = wall;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Sydney",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);
    const p = (key: string) => parts.find((part) => part.type === key)!.value;
    const rendered = Date.parse(
      `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}:${p("second")}Z`,
    );
    instant = new Date(instant.getTime() + wall.getTime() - rendered);
  }
  if (sydneyInput(instant.toISOString()) !== value)
    throw new Error(
      "Choose a valid Sydney time outside the daylight saving change.",
    );
  return instant.toISOString();
}
export function sydneyInput(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const p = (key: string) => parts.find((part) => part.type === key)!.value;
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}`;
}
