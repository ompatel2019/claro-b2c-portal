"use client";
import { useState } from "react";
import { Button } from "./ui/button";

/** Finishes an abandoned sprint from the setup banner (§3.2), then opens its results. */
export function FinishSprint({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function finish() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/sessions/${id}/finish`, { method: "POST" });
    if (res.ok) return window.location.assign(`/practice/${id}/results`);
    setBusy(false);
    setError("Couldn’t finish. Try again.");
  }
  return (
    <>
      <Button variant="outline" size="sm" disabled={busy} onClick={finish}>
        {busy ? "Finishing…" : "Finish and mark"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive w-full text-xs">
          {error}
        </p>
      )}
    </>
  );
}
