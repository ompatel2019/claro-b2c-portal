"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
export function RetryAnswer({ id, marking }: { id: string; marking: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function retry() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/attempts/${id}/mark`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <p>{marking ? "Still marking" : "Couldn’t mark this answer"}</p>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => (marking ? router.refresh() : void retry())}
      >
        {busy ? "Marking…" : marking ? "Refresh" : "Retry"}
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
