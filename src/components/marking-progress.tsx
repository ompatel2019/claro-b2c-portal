"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** §3.4 marking progress: re-renders the page every 1.5 s, backing off to 5 s after 30 s. */
export function MarkingProgress({
  done,
  total,
}: {
  done: number;
  total: number;
}) {
  const router = useRouter();
  const active = done < total;
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
  if (!active) return null;
  return (
    <div className="bg-card space-y-2 rounded-xl border p-4">
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span className="font-medium">
          {done} of {total} marked
        </span>
        <span className="text-muted-foreground">
          You can leave this page. We’ll keep marking.
        </span>
      </div>
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
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>
    </div>
  );
}
