"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AnnotatedFeedback,
  type EditableComment,
} from "@/components/annotated-feedback";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  bandOf,
  readComments,
  nextMarkLine,
  type ReviewRow,
} from "@/lib/feedback";
import type { Review } from "../data";
import { resolveReview } from "../actions";
import { commentChanged } from "../shared";

export function ReviewEditor({
  id,
  row,
  review,
  photos,
  prev,
  next,
  guidelineNotes,
}: {
  id: string;
  row: ReviewRow;
  review: Review;
  photos: string[];
  prev: string | null;
  next: string | null;
  guidelineNotes: string | null;
}) {
  const router = useRouter();
  const readonly = review.status === "resolved";
  const guidelinesUnavailable =
    row.question_id != null && row.type !== "mcq" && row.criteria == null;
  const initial = Number(
    readonly
      ? (review.final_mark ?? row.mark ?? 0)
      : (row.mark ?? review.ai_mark ?? 0),
  );
  const max = row.max_marks ?? row.marks;
  const [mark, setMark] = useState(initial);
  const original = readComments(
    row.feedback,
    row.transcript ?? row.answer_text ?? "",
  );
  const [comments, setComments] = useState<EditableComment[]>(
    original.map((c) => ({
      id: c.id,
      quote: c.quote,
      start: c.start,
      kind: c.kind,
      tag: c.tag,
      body: c.body,
      next_mark: c.next_mark,
    })),
  );
  const [nextMark, setNextMark] = useState(
    nextMarkLine(original, row.feedback, initial >= max) ?? "",
  );
  const history = useRef<{ comments: EditableComment[]; nextMark: string }[]>(
    [],
  );
  const [undoCount, setUndoCount] = useState(0);
  const commentsRef = useRef({ comments, nextMark });
  const changeField = useRef<Element | null>(null);
  const change = (items: EditableComment[], line: string) => {
    const field = document.activeElement;
    const typing = field?.matches("input,textarea,select");
    if (!typing || changeField.current !== field)
      history.current.push(commentsRef.current);
    changeField.current = typing ? field : null;
    commentsRef.current = { comments: items, nextMark: line };
    setComments(items);
    setNextMark(line);
    setUndoCount(history.current.length);
  };
  const undo = (deleted?: EditableComment) => {
    if (deleted) {
      const current = commentsRef.current;
      if (!current.comments.some((c) => c.id === deleted.id))
        change([...current.comments, deleted], current.nextMark);
      return;
    }
    changeField.current = null;
    const previous = history.current.pop();
    if (!previous) return;
    commentsRef.current = previous;
    setComments(previous.comments);
    setNextMark(previous.nextMark);
    setUndoCount(history.current.length);
  };
  const [note, setNote] = useState(review.admin_note ?? "");
  const [message, action, pending] = useActionState(
    resolveReview.bind(null, id),
    null,
  );
  const form = useRef<HTMLFormElement>(null);
  const resolve = useRef<HTMLButtonElement>(null);

  const criterion =
    mark === 0
      ? null
      : row.criteria?.find((c) => mark >= c.min && mark <= c.max);
  const band = bandOf(row.criteria, criterion?.descriptor ?? null);
  const adjust = (value: number) =>
    setMark(Math.max(0, Math.min(max, Math.round(value))));
  const changed = (c: EditableComment) => {
    const before = original.find((item) => item.id === c.id);
    return before && commentChanged(before, c);
  };
  const edited = comments.filter((c) => c.id >= 0 && changed(c)).length;
  const deleted = original.filter(
    (c) => !comments.some((item) => item.id === c.id),
  ).length;
  const added = comments.filter((c) => c.id < 0).length;
  const editedRow: ReviewRow = {
    ...row,
    mark,
    status: "marked",
    check_status: readonly ? "reviewed" : "in_review",
    review: null,
    band: criterion?.descriptor ?? "NO BAND SATISFIED",
    feedback: {
      ...row.feedback,
      ...(mark > 0 && row.feedback?.note === "No answer"
        ? { note: undefined }
        : {}),
      comments: readonly ? row.feedback?.comments : comments,
      next_mark_line: readonly ? row.feedback?.next_mark_line : nextMark,
    },
  };

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        e.target.closest("input,textarea,select,[contenteditable=true]") !==
          null;
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "Enter" &&
        !readonly &&
        !guidelinesUnavailable &&
        !pending
      ) {
        e.preventDefault();
        form.current?.requestSubmit(resolve.current);
        return;
      }
      if (pending || e.altKey) return;
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "z" &&
        !readonly
      ) {
        e.preventDefault();
        undo();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey) return;
      const key = e.key.toLowerCase();
      if (key === "p" && prev) {
        e.preventDefault();
        router.push(`/admin/marking/review/${prev}`);
      }
      if (key === "n" && next) {
        e.preventDefault();
        router.push(`/admin/marking/review/${next}`);
      }
      if (readonly) return;
      if (key === "a" && review.ai_mark != null) {
        e.preventDefault();
        setMark(Math.max(0, Math.min(max, Math.round(Number(review.ai_mark)))));
      }
      if (key === "c" && review.check_mark != null) {
        e.preventDefault();
        setMark(
          Math.max(0, Math.min(max, Math.round(Number(review.check_mark)))),
        );
      }
      if (!e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        e.stopPropagation();
        setMark((m) =>
          Math.max(0, Math.min(max, m + (e.key === "ArrowUp" ? 1 : -1))),
        );
      }
    };
    window.addEventListener("keydown", keydown, true);
    return () => {
      window.removeEventListener("keydown", keydown, true);
    };
  });

  return (
    <form
      ref={form}
      action={action}
      className="space-y-4"
      onBlurCapture={() => {
        changeField.current = null;
      }}
    >
      {guidelinesUnavailable && !readonly && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          Marking guidelines are available after this session is finished. Keep
          this review open until then.
        </p>
      )}
      <nav className="flex gap-2" aria-label="Reviews in queue">
        {prev && (
          <Link
            className={buttonVariants({ variant: "outline", size: "sm" })}
            href={`/admin/marking/review/${prev}`}
          >
            Prev (P)
          </Link>
        )}
        {next && (
          <Link
            className={buttonVariants({ variant: "outline", size: "sm" })}
            href={`/admin/marking/review/${next}`}
          >
            Next (N)
          </Link>
        )}
      </nav>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <p className="text-sm whitespace-pre-wrap">{row.stem}</p>
          <AnnotatedFeedback
            row={editedRow}
            photos={photos}
            edit={
              readonly
                ? undefined
                : {
                    comments,
                    nextMark,
                    onChange: change,
                    onUndo: undo,
                    disabled: pending,
                  }
            }
          />
          {!readonly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !undoCount}
              onClick={() => undo()}
            >
              Undo (⌘/Ctrl+Z)
            </Button>
          )}
        </div>
        <div className="panel min-w-0 space-y-4">
          <fieldset disabled={readonly || pending} className="space-y-3">
            <legend className="mb-2 font-semibold">Mark</legend>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                aria-label="Decrease mark (↓)"
                disabled={mark <= 0}
                onClick={() => adjust(mark - 1)}
              >
                − (↓)
              </Button>
              <Input
                aria-label="Final mark"
                name="mark"
                type="number"
                min={0}
                max={max}
                step={1}
                required
                value={mark}
                className="w-20 text-center"
                onChange={(e) => adjust(Number(e.target.value))}
              />
              <Button
                type="button"
                variant="outline"
                aria-label="Increase mark (↑)"
                disabled={mark >= max}
                onClick={() => adjust(mark + 1)}
              >
                + (↑)
              </Button>
              <span>/ {max}</span>
            </div>
            <p className="text-sm" title={criterion?.descriptor}>
              {band?.label ?? "No band satisfied"}
              {criterion && (
                <span className="sr-only">: {criterion.descriptor}</span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {review.ai_mark != null && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => adjust(Number(review.ai_mark))}
                >
                  Use AI mark ({review.ai_mark}) · A
                </Button>
              )}
              {review.check_mark != null && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => adjust(Number(review.check_mark))}
                >
                  Use check mark ({review.check_mark}) · C
                </Button>
              )}
            </div>
          </fieldset>
          <section className="space-y-2">
            <h2 className="text-base font-semibold">Why the models differ</h2>
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div>
                <h3 className="font-medium">AI</h3>
                <p className="whitespace-pre-wrap">
                  {typeof row.feedback?.justification === "string"
                    ? row.feedback.justification
                    : "No justification recorded."}
                </p>
                {typeof row.feedback?.why_not_higher === "string" && (
                  <p className="mt-2 whitespace-pre-wrap">
                    {row.feedback.why_not_higher}
                  </p>
                )}
              </div>
              <div>
                <h3 className="font-medium">Checker</h3>
                <p className="whitespace-pre-wrap">
                  {review.check_notes || "No checker notes recorded."}
                </p>
              </div>
            </div>
          </section>
          {review.student_note && (
            <section className="text-sm">
              <h2 className="text-base font-semibold">Student note</h2>
              <p className="whitespace-pre-wrap">{review.student_note}</p>
            </section>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">
              Marking guidelines
            </summary>
            {row.criteria?.map((c) => (
              <p
                key={c.descriptor}
                className={`mt-2 ${c === criterion ? "bg-accent rounded p-2" : ""}`}
              >
                <strong>
                  {c.min}–{c.max}:
                </strong>{" "}
                {c.descriptor}
              </p>
            ))}
            {guidelineNotes && (
              <p className="mt-2 whitespace-pre-wrap">{guidelineNotes}</p>
            )}
            {!row.criteria?.length && !guidelineNotes && (
              <p>No guidelines recorded.</p>
            )}
          </details>
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">
              Sample answer
            </summary>
            <p className="mt-2 whitespace-pre-wrap">
              {row.sample_answer || "No sample answer recorded."}
            </p>
          </details>
          <label className="grid gap-2 text-sm font-medium">
            Admin note
            <Textarea
              name="admin_note"
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={readonly || pending}
            />
            <span className="text-muted-foreground text-xs">
              {note.length}/1000 · Internal only
            </span>
          </label>
        </div>
      </div>
      {message && (
        <p role="alert" className="rounded-lg border p-3 text-sm">
          {message}{" "}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
          >
            Reload review
          </Button>
        </p>
      )}
      {!readonly && (
        <div className="space-y-2 border-t pt-4">
          <input
            type="hidden"
            name="comments"
            value={JSON.stringify(comments)}
          />
          <input type="hidden" name="next_mark_line" value={nextMark} />
          <p className="text-sm">
            {[
              `Mark ${initial} → ${mark}`,
              ...(edited
                ? [`${edited} ${edited === 1 ? "comment" : "comments"} edited`]
                : []),
              ...(deleted ? [`${deleted} deleted`] : []),
              ...(added ? [`${added} added`] : []),
            ].join(" · ")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              ref={resolve}
              type="submit"
              disabled={pending || guidelinesUnavailable}
            >
              {pending ? "Resolving…" : "Resolve (⌘/Ctrl+Enter)"}
            </Button>
            <Button
              type="submit"
              variant="outline"
              name="unchanged"
              value="yes"
              disabled={pending || guidelinesUnavailable}
            >
              Resolve unchanged
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            A / C use model marks · ↑ / ↓ adjust mark · P / N navigate ·
            ⌘/Ctrl+Enter resolve · ⌘/Ctrl+Z undo comment change · Esc clears
            selection
          </p>
        </div>
      )}
    </form>
  );
}
