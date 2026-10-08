"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders the server page every few seconds while answers are still being marked. */
export function RefreshWhile({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const stop = Date.now() + 10 * 60_000;
    const timer = setInterval(
      () => (Date.now() > stop ? clearInterval(timer) : router.refresh()),
      4000,
    );
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
