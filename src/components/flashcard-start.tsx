"use client";
import { useActionState } from "react";
import { startFlashcards } from "@/app/(app)/flashcards/actions";
import { Button } from "./ui/button";
export function FlashcardStart({
  topic = "",
  due = false,
  cardIds = [],
  label = "Start deck",
  settings = false,
  variant,
}: {
  topic?: string;
  due?: boolean;
  cardIds?: string[];
  label?: string;
  settings?: boolean;
  variant?: "outline";
}) {
  const [state, action, pending] = useActionState(startFlashcards, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="topic" value={topic} />
      {due && <input type="hidden" name="due" value="1" />}
      {cardIds.map((id) => (
        <input key={id} type="hidden" name="card_ids" value={id} />
      ))}
      {settings ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2" htmlFor="flashcard-type">
            Card type
            <select
              id="flashcard-type"
              className="field"
              name="type"
              defaultValue="both"
            >
              <option value="term">Terms</option>
              <option value="stat">Key stats</option>
              <option value="both">Both</option>
            </select>
          </label>
          <label className="grid gap-2" htmlFor="flashcard-mode">
            Mode
            <select
              id="flashcard-mode"
              className="field"
              name="mode"
              defaultValue="study"
            >
              <option value="study">Study: flip and rate yourself</option>
              <option value="test">Test: type your answer, AI checks it</option>
            </select>
          </label>
        </div>
      ) : (
        <>
          <input type="hidden" name="mode" value="study" />
          <input type="hidden" name="type" value="both" />
        </>
      )}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Starting…" : label}
      </Button>
      {state.error && (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
