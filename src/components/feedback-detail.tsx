"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { updateStudentFeedback } from "@/app/admin/students/actions";
import { safeLocalPath } from "@/lib/students";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

export type FeedbackDetailRow = {
  id: string;
  user_id: string;
  message: string;
  status: "new" | "triaged" | "resolved";
  admin_note: string | null;
  page_path: string | null;
  user_agent: string | null;
  question_id: string | null;
  session_id: string | null;
};
/** Full feedback context and its one admin reply/status write path (§4.10). */
export function FeedbackDetail({
  row,
  photos,
}: {
  row: FeedbackDetailRow;
  photos: string[];
}) {
  const [status, setStatus] = useState(row.status);
  const [reply, setReply] = useState(row.admin_note ?? "");
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const page = safeLocalPath(row.page_path);
  function save(resolve: boolean) {
    start(async () => {
      setError(null);
      try {
        await updateStudentFeedback(
          row.id,
          row.user_id,
          resolve ? "resolved" : status,
          reply,
        );
        if (resolve) setStatus("resolved");
        toast.success("Feedback saved");
      } catch {
        setError("Couldn't save this. Try again.");
      }
    });
  }
  return (
    <>
      <p className="whitespace-pre-wrap">{row.message}</p>
      <div className="flex flex-wrap gap-2">
        {photos.map((url, i) => (
          <Button key={url} variant="outline" onClick={() => setPhoto(url)}>
            Screenshot {i + 1}
          </Button>
        ))}
      </div>
      <Dialog open={!!photo} onOpenChange={(open) => !open && setPhoto(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogTitle>Screenshot</DialogTitle>
          {/* Signed private storage URLs; natural dimensions preserve screenshot detail. */}
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element -- Private screenshots retain their original dimensions.
            <img
              src={photo}
              alt="Student feedback screenshot"
              className="max-h-[75vh] max-w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
      {page && (
        <Link href={page} className="block underline">
          Page: {page}
        </Link>
      )}
      <p className="text-muted-foreground text-sm">
        User agent: {row.user_agent || "Not supplied"}
      </p>
      {row.question_id && (
        <Link
          href={`/admin/content/questions/${encodeURIComponent(row.question_id)}`}
          className="block underline"
        >
          Open in editor
        </Link>
      )}
      {row.session_id && (
        <Link
          href={`/admin/students/${row.user_id}?tab=sessions&session=${row.session_id}`}
          className="block underline"
        >
          Open report
        </Link>
      )}
      <label className="grid gap-1">
        Status
        <select
          aria-label="Status"
          className="field h-9"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          disabled={pending}
        >
          <option value="new">New</option>
          <option value="triaged">Triaged</option>
          <option value="resolved">Resolved</option>
        </select>
      </label>
      <label className="grid gap-1">
        Reply to student
        <Textarea
          aria-label="Reply to student"
          maxLength={2000}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          disabled={pending}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => save(false)}
        >
          Save
        </Button>
        <Button disabled={pending} onClick={() => save(true)}>
          Resolve
        </Button>
      </div>
    </>
  );
}
