import { afterEach, describe, expect, it } from "vitest";
import {
  PERSIST_QUEUE_KEY,
  dropPersistSession,
  enqueuePersistRating,
  isMissingSessionError,
  loadPersistQueue,
  removePersistRating,
} from "./flashcard-persist-queue";

afterEach(() => {
  localStorage.removeItem(PERSIST_QUEUE_KEY);
});

describe("flashcard persist queue", () => {
  it("enqueues, dedupes by session+card, and drops a whole session", () => {
    enqueuePersistRating({ sessionId: "s1", cardId: "c1", mark: 1 });
    enqueuePersistRating({ sessionId: "s1", cardId: "c1", mark: 0 });
    enqueuePersistRating({ sessionId: "s1", cardId: "c2", mark: 1 });
    enqueuePersistRating({ sessionId: "s2", cardId: "c1", mark: 1 });
    expect(loadPersistQueue()).toEqual([
      { sessionId: "s1", cardId: "c1", mark: 0 },
      { sessionId: "s1", cardId: "c2", mark: 1 },
      { sessionId: "s2", cardId: "c1", mark: 1 },
    ]);
    removePersistRating("s1", "c2");
    dropPersistSession("s1");
    expect(loadPersistQueue()).toEqual([
      { sessionId: "s2", cardId: "c1", mark: 1 },
    ]);
  });

  it("detects missing-session errors", () => {
    expect(
      isMissingSessionError(
        new Error("This session was reset or expired. Start the deck again."),
      ),
    ).toBe(true);
    expect(isMissingSessionError(new Error("network down"))).toBe(false);
  });
});

it("keeps spoken answer metadata with an offline self rating", () => {
  const rating = {
    sessionId: "s",
    cardId: "c",
    mark: 0.5 as const,
    answer: "Spoken answer",
    answerMode: "spoken" as const,
  };
  enqueuePersistRating(rating);
  expect(loadPersistQueue()).toEqual([rating]);
  removePersistRating("s", "c");
  expect(localStorage.getItem(PERSIST_QUEUE_KEY)).toBeNull();
});
