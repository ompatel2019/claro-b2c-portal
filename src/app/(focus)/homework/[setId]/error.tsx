"use client";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
export default function HomeworkDoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto max-w-xl space-y-6 px-5 py-16">
      <h1>Couldn’t open this homework</h1>
      <p>
        Your progress may have been reset, or this set is no longer available.
        Go back to Homework and continue from there.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link className="button-link" href="/homework">
          Back to Homework
        </Link>
        <Button variant="outline" type="button" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
