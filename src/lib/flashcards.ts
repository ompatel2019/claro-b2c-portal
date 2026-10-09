import type { DeckConfig } from "./deck";
import { addDays } from "./activity";
export type FlashcardMark = 0 | 0.5 | 1;
export type Flashcard = {
  id: string;
  topic_id: string;
  kind: "term" | "stat";
  front: string;
  back: string;
};
export type FlashcardConfig = Pick<DeckConfig, "mode" | "topics" | "kinds"> &
  Partial<Omit<DeckConfig, "mode" | "topics" | "kinds">> & {
    due?: boolean;
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
  updated_at: string;
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
          ? Math.max(3, Math.ceil(prev.interval_days * 2.5))
          : 3,
  );
  return { interval_days, due_on: addDays(today, interval_days) };
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
  repeatMissed = true,
  attempts = 0,
) {
  const next = queue.filter((id) => id !== cardId);
  if (repeatMissed && mark < 1 && attempts < 3) next.push(cardId);
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
  repeatMissed = true,
) {
  let queue = [...ids];
  const attempts = new Map<string, number>();
  const available = new Set(ids);
  for (const review of reviews) {
    if (!available.has(review.flashcard_id)) continue;
    const count = attempts.get(review.flashcard_id) ?? 0;
    queue = nextQueue(
      queue,
      review.flashcard_id,
      review.mark,
      repeatMissed,
      count,
    );
    attempts.set(review.flashcard_id, count + 1);
  }
  return queue;
}

/** Normalise for flashcard matching. */
export function normaliseAnswer(text: string) {
  let s = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  // Expand "term (ACR)" → keep both full phrase and acronym as tokens later
  s = s.replace(/\(([^)]+)\)/g, " $1 ");
  s = s.replace(/[^a-z0-9\s%$]/g, " ");
  s = s.replace(/\b(a|an|the)\b/g, " ");
  // Light plural fold: economies→economy, services→service (keep short words)
  s = s
    .replace(/\b([a-z]{4,})ies\b/g, "$1y")
    .replace(/\b([a-z]{4,})s\b/g, "$1");
  return s.replace(/\s+/g, " ").trim();
}

function tokens(text: string) {
  return text.split(" ").filter(Boolean);
}

function sortedJoin(text: string) {
  return tokens(text).sort().join(" ");
}

function parentheticals(raw: string) {
  return [...raw.matchAll(/\(([^)]+)\)/g)].map((m) => normaliseAnswer(m[1]));
}

function withoutParentheticals(raw: string) {
  return normaliseAnswer(raw.replace(/\([^)]*\)/g, " "));
}

/**
 * Deterministic flashcard mark. Returns 1 when confidently correct, else null
 * (defer to AI). Does not return 0.5 — partials are for the model.
 */
export function matchFlashcardAnswer(
  answer: string,
  back: string,
  front?: string,
): { mark: FlashcardMark; reason: string } | null {
  const a = normaliseAnswer(answer);
  const b = normaliseAnswer(back);
  if (!a || !b) return null;
  if (a === b || sortedJoin(a) === sortedJoin(b))
    return { mark: 1, reason: "Exact match with the model answer." };
  // Acronym inside parentheses, or expanded form without the acronym
  const acrs = parentheticals(back);
  if (acrs.includes(a))
    return { mark: 1, reason: "Matches the acronym in the model answer." };
  const bare = withoutParentheticals(back);
  if (bare && (a === bare || sortedJoin(a) === sortedJoin(bare)))
    return { mark: 1, reason: "Matches the expanded model answer." };
  // Answer contains the full model answer
  if (a.includes(b)) return { mark: 1, reason: "Matches the model answer." };
  // Model contains answer — only when the answer covers most content tokens
  // (blocks thin substrings like "GDP" matching "GDP per capita")
  const stop = new Set([
    "by",
    "of",
    "to",
    "in",
    "on",
    "for",
    "and",
    "or",
    "as",
    "is",
    "are",
    "with",
  ]);
  const aTok = tokens(a).filter((t) => !stop.has(t));
  const bTok = tokens(b).filter((t) => !stop.has(t));
  if (!bTok.length) return null;
  if (b.includes(a) && aTok.length >= Math.ceil(bTok.length * 0.75))
    return { mark: 1, reason: "Matches the model answer." };
  const aSet = new Set(aTok);
  const hit = bTok.filter((t) => aSet.has(t)).length;
  const ratio = hit / bTok.length;
  // High coverage of content tokens in the model answer → accept
  if (ratio >= 0.7 && hit >= Math.min(3, bTok.length))
    return { mark: 1, reason: "Covers the key points of the model answer." };
  // Answering with the prompt term alone is not the definition
  if (front) {
    const f = normaliseAnswer(front);
    if (f && (a === f || sortedJoin(a) === sortedJoin(f))) return null;
  }
  return null;
}

export function skipQueue(queue: readonly string[]) {
  return queue.length > 1 ? [...queue.slice(1), queue[0]] : [];
}
