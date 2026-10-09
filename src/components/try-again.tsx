"use client";
import { useRouter } from "next/navigation";
import { Alert } from "./icons";
import { Button } from "./ui/button";

/** Per-card load error (§1): Alert text plus a Try again that re-renders the page. */
export function TryAgain({ what }: { what: string }) {
  const router = useRouter();
  return (
    <div
      role="alert"
      className="text-destructive flex flex-wrap items-center gap-3 text-sm"
    >
      <Alert className="size-4" aria-hidden />
      Couldn’t load {what}.
      <Button variant="outline" size="sm" onClick={() => router.refresh()}>
        Try again
      </Button>
    </div>
  );
}
