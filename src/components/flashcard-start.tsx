"use client";
import { useActionState } from "react";
import { startFlashcards } from "@/app/(app)/flashcards/actions";
import { Button } from "./ui/button";
export function FlashcardStart({
  due = false,
  disabled = false,
  mode = "study",
  cardIds = [],
  label = "Start deck",
  variant,
  className,
}: {
  due?: boolean;
  disabled?: boolean;
  mode?: "study" | "test";
  cardIds?: string[];
  label?: string;
  variant?: "outline";
  className?: string;
}) {
  const [state, action, pending] = useActionState(startFlashcards, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="mode" value={mode} />
      {due && <input type="hidden" name="due" value="1" />}
      {cardIds.map((id) => (
        <input key={id} type="hidden" name="card_ids" value={id} />
      ))}
      <Button
        type="submit"
        variant={variant}
        className={className}
        disabled={pending || disabled}
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
