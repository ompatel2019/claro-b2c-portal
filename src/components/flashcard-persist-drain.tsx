"use client";
import { useEffect } from "react";
import { rateFlashcard } from "@/app/(app)/flashcards/actions";
import {
  dropPersistSession,
  isMissingSessionError,
  loadPersistQueue,
  removePersistRating,
} from "@/lib/flashcard-persist-queue";

/** Drain durable rating persists; drop a session after the first missing-session error. */
export function FlashcardPersistDrain() {
  useEffect(() => {
    let cancelled = false;
    const dropped = new Set<string>();
    async function drain() {
      for (const item of loadPersistQueue()) {
        if (cancelled) return;
        if (dropped.has(item.sessionId)) {
          dropPersistSession(item.sessionId);
          continue;
        }
        try {
          await rateFlashcard(item.sessionId, item.cardId, item.mark);
          removePersistRating(item.sessionId, item.cardId);
        } catch (error) {
          if (isMissingSessionError(error)) {
            dropped.add(item.sessionId);
            dropPersistSession(item.sessionId);
          }
          // Leave other failures queued for a later visit.
        }
      }
    }
    void drain();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
