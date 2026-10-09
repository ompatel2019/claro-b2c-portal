"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
/** Re-marks failed answers one by one (one id per question, or "Retry all failed" on results). */
export function RetryAnswer({
  ids,
  label = "Retry",
}: {
  ids: string[];
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function retry() {
    setBusy(true);
    setError("");
    try {
      for (const id of ids) {
        const r = await fetch(`/api/attempts/${id}/mark`, { method: "POST" });
        if (!r.ok) throw new Error((await r.json()).error);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" disabled={busy} onClick={retry}>
        {busy ? "Marking…" : label}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
