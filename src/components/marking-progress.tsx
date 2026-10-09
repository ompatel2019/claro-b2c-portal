"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** §3.4 marking progress: re-renders the page every 1.5 s, backing off to 5 s after 30 s. */
export function MarkingProgress({
  done,
  total,
  marking,
  attention,
}: {
  done: number;
  total: number;
  marking: number;
  attention: number;
}) {
  const router = useRouter();
  const active = marking > 0;
  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const waited = Date.now() - start;
      if (waited > 10 * 60_000) return;
      timer = setTimeout(
        () => {
          router.refresh();
          tick();
        },
        waited > 30_000 ? 5000 : 1500,
      );
    };
    tick();
    return () => clearTimeout(timer);
  }, [active, router]);

  const status = (
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {done} of {total} marked
      {attention ? ` · ${attention} need attention` : ""}.{" "}
      {active ? `${marking} still marking.` : "Marking complete."}
    </p>
  );
  // Fully marked: nothing to show, but the live region stays to announce completion.
  if (!active && !attention) return status;
  return (
    <div className="bg-card space-y-2 rounded-xl border p-4">
      {status}
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span className="font-medium">
          {done} of {total} marked
          {attention > 0 ? ` · ${attention} need attention` : ""}
        </span>
        {active && (
          <span className="text-muted-foreground">
            You can leave this page. We’ll keep marking.
          </span>
        )}
      </div>
      {active && (
        <div
          role="progressbar"
          aria-label="Marking progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="bg-muted h-2 overflow-hidden rounded-full"
        >
          <div
            className="bg-primary h-full transition-all"
            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
          />
        </div>
      )}
    </div>
  );
}
