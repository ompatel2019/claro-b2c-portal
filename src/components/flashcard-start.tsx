"use client";
import { useActionState } from "react";
import { startFlashcards } from "@/app/(app)/flashcards/actions";
import { Button } from "./ui/button";
export function FlashcardStart({
  due = false,
  cardIds = [],
  label = "Start deck",
  variant,
  className,
}: {
  due?: boolean;
  cardIds?: string[];
  label?: string;
  variant?: "outline";
  className?: string;
}) {
  const [state, action, pending] = useActionState(startFlashcards, {});
  return (
    <form action={action} className="space-y-4">
      {due && <input type="hidden" name="due" value="1" />}
      {cardIds.map((id) => (
        <input key={id} type="hidden" name="card_ids" value={id} />
      ))}
      <Button
        type="submit"
        variant={variant}
        className={className}
        disabled={pending}
      >
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
