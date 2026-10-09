"use client";
import { useEffect } from "react";
import { drainPersistRating } from "@/app/(app)/flashcards/actions";
import {
  activeSessions,
  dropPersistSession,
  loadPersistQueue,
  removePersistRating,
} from "@/lib/flashcard-persist-queue";

/** Drain durable rating persists; drop a session after the first missing-session result. */
export function FlashcardPersistDrain() {
  useEffect(() => {
    let cancelled = false;
    const dropped = new Set<string>();
    let draining = false;
    async function drain() {
      if (draining) return;
      draining = true;
      try {
        for (const item of loadPersistQueue()) {
          if (cancelled) return;
          if (activeSessions.has(item.sessionId)) continue;
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
      } finally {
        draining = false;
      }
    }
    const retry = () => void drain().catch(() => {});
    retry();
    window.addEventListener("online", retry);
    return () => {
      cancelled = true;
      window.removeEventListener("online", retry);
    };
  }, []);
  return null;
}
