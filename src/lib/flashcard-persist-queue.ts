/** Client-only durable queue for background flashcard rating persists. */
export type PersistRating = {
  sessionId: string;
  cardId: string;
  mark: 0 | 0.5 | 1;
  answer?: string;
  answerMode?: "typed" | "spoken";
};

export const activeSessions = new Set<string>();

export const PERSIST_QUEUE_KEY = "claro.flashcard.persist";

function read(): PersistRating[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PERSIST_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PersistRating =>
        !!item &&
        typeof item === "object" &&
        typeof (item as PersistRating).sessionId === "string" &&
        typeof (item as PersistRating).cardId === "string" &&
        [0, 0.5, 1].includes((item as PersistRating).mark),
    );
  } catch {
    return [];
  }
}

function write(items: PersistRating[]) {
  if (typeof window === "undefined") return;
  if (!items.length) localStorage.removeItem(PERSIST_QUEUE_KEY);
  else localStorage.setItem(PERSIST_QUEUE_KEY, JSON.stringify(items));
}

export function loadPersistQueue() {
  return read();
}

export function enqueuePersistRating(item: PersistRating) {
  const next = read().filter(
    (r) => !(r.sessionId === item.sessionId && r.cardId === item.cardId),
  );
  next.push(item);
  write(next);
}

export function removePersistRating(sessionId: string, cardId: string) {
  write(
    read().filter((r) => !(r.sessionId === sessionId && r.cardId === cardId)),
  );
}

/** Drop every queued rating for a missing/expired session (404 / reset). */
export function dropPersistSession(sessionId: string) {
  write(read().filter((r) => r.sessionId !== sessionId));
}

export function isMissingSessionError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return (
    /reset or expired/i.test(msg) ||
    /session was reset/i.test(msg) ||
    /not found/i.test(msg) ||
    /unauthorised/i.test(msg)
  );
}
