"use client";
import { useEffect } from "react";
import { drainPersistRating } from "@/app/(app)/flashcards/actions";
import {
  dropPersistSession,
  loadPersistQueue,
  removePersistRating,
} from "@/lib/flashcard-persist-queue";

/** Drain durable rating persists; drop a session after the first missing-session result. */
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
        const result = await drainPersistRating(item);
        if (cancelled) return;
        if (result === "ok") removePersistRating(item.sessionId, item.cardId);
        else if (result === "missing") {
          dropped.add(item.sessionId);
          dropPersistSession(item.sessionId);
        }
        // "error" — leave queued for a later visit.
      }
    }
    void drain();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
