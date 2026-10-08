"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { Textarea } from "./ui/textarea";

/** §2.5: ask our team to re-check a written mark. */
export function QuestionMark({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/attempts/${attemptId}/dispute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      setOpen(false);
      toast.success("Sent. Our team will re-check your answer.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Question this mark
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle>Question this mark</DialogTitle>
          <DialogDescription>
            Our team will re-check your answer. Your mark can go up or down.
          </DialogDescription>
          <form onSubmit={submit} className="space-y-3">
            <label className="block space-y-1.5 text-sm font-medium">
              What do you think we missed?
              <Textarea
                required
                minLength={10}
                maxLength={1000}
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <p className="text-muted-foreground text-right text-xs tabular-nums">
              {note.length}/1000
            </p>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || note.trim().length < 10}>
                {busy ? "Sending…" : "Submit"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
