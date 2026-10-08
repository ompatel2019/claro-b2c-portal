export type FlashcardMark = 0 | 0.5 | 1;
export type Flashcard = {
  id: string;
  topic_id: string;
  kind: "term" | "stat";
  front: string;
  back: string;
};
export type FlashcardConfig = {
  mode: "study" | "test";
  topics: string[];
  kinds: ("term" | "stat")[];
  due: boolean;
  card_ids: string[];
};
export type FlashcardReview = {
  id: string;
  flashcard_id: string;
  mark: FlashcardMark;
  answer: string | null;
  reason: string | null;
  source: "self" | "ai";
  created_at: string;
};
export type FlashcardProgress = {
  flashcard_id: string;
  interval_days: number;
  due_on: string;
  last_mark: FlashcardMark;
  reviews: number;
};
export function schedule(
  prev: { interval_days: number } | null,
  mark: FlashcardMark,
  today: string,
) {
  const interval_days = Math.min(
    60,
    mark === 0
      ? 1
      : mark === 0.5
        ? Math.max(1, Math.ceil((prev?.interval_days ?? 0) * 1.2))
        : prev
          ? Math.ceil(prev.interval_days * 2.5)
          : 3,
  );
  const due = new Date(`${today}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + interval_days);
  return { interval_days, due_on: due.toISOString().slice(0, 10) };
}
export function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function nextQueue(
  queue: readonly string[],
  cardId: string,
  mark: FlashcardMark,
) {
  const next = queue.filter((id) => id !== cardId);
  if (mark < 1) next.push(cardId);
  return next;
}
export function sydneyToday(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function firstReviews(reviews: readonly FlashcardReview[]) {
  const first = new Map<string, FlashcardReview>();
  for (const review of reviews)
    if (!first.has(review.flashcard_id)) first.set(review.flashcard_id, review);
  return first;
}
export function resumeQueue(
  ids: readonly string[],
  reviews: readonly FlashcardReview[],
) {
  const latest = new Map(reviews.map((r) => [r.flashcard_id, r.mark]));
  return ids.filter((id) => latest.get(id) !== 1);
}
