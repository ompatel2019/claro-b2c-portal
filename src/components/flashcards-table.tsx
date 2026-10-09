"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  bulkFlashcards,
  saveCard,
  undoFlashcards,
} from "@/app/admin/content/flashcards/actions";
import { DataTable, type Column } from "@/components/data-table";
import type { Pager } from "@/lib/admin";
import type { FlashcardRow } from "@/lib/admin-flashcards";
import type { CardInput } from "@/lib/flashcard-import";
import {
  CARD_FRONT_LIMIT as FRONT_MAX,
  CARD_BACK_LIMIT as BACK_MAX,
} from "@/lib/limits";
import { dateLabel, type Topic } from "@/lib/practice";
import { StatusPill, STATUS_PILL } from "./status-pill";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogFooter,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

const KIND = { term: "Term", stat: "Stat" } as const;
const ORIGIN = { a1: "A1", claro: "Claro" } as const;
const EMPTY: CardInput = {
  id: null,
  kind: "term",
  topic_id: "",
  front: "",
  back: "",
  status: "draft",
};

function RetireConfirmation({
  open,
  count,
  onClose,
  onConfirm,
  pending,
}: {
  open: boolean;
  count: number;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <AlertDialogContent>
        <AlertDialogTitle>
          Retire {count === 1 ? "card" : `${count} cards`}?
        </AlertDialogTitle>
        <AlertDialogDescription>
          These cards will be hidden from students. You can publish them again.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button disabled={pending} onClick={onConfirm}>
            {pending ? "Retiring…" : "Retire"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function undoToast(
  message: string,
  previous: unknown[],
  version: string,
  refresh: () => void,
) {
  toast.success(message, {
    action: {
      label: "Undo",
      onClick: () => {
        void undoFlashcards(previous, version)
          .then((r) => {
            toast.success(
              r.done === r.total
                ? "Change undone"
                : `Restored ${r.done} cards. Later edits kept.`,
            );
            refresh();
          })
          .catch(() => toast.error("Couldn't undo. Try again."));
      },
    },
  });
}

/** Add / Edit Dialog: Kind, Topic, Front ≤200, Back ≤1,000, Status. */
function CardDialog({
  card,
  topics,
  onClose,
}: {
  card: CardInput | null;
  topics: Topic[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<CardInput>(card ?? EMPTY);
  const [error, setError] = useState("");
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [pending, start] = useTransition();
  const name = (id: string | null) =>
    topics.find((t) => t.id === id)?.name ?? "";
  const set = <K extends keyof CardInput>(k: K, v: CardInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  function save() {
    setError("");
    start(async () => {
      const r = await saveCard(form).catch(() => ({
        error: "Could not save. Try again.",
      }));
      if ("error" in r) {
        setConfirmRetire(false);
        return setError(r.error ?? "Could not save. Try again.");
      }
      if (
        form.status === "retired" &&
        card?.status !== "retired" &&
        r.previous.length
      )
        undoToast("Card retired", r.previous, r.version, () =>
          router.refresh(),
        );
      else toast.success("Saved");
      onClose();
      router.refresh();
    });
  }
  return (
    <Dialog open={!!card} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>{form.id ? "Edit card" : "Add card"}</DialogTitle>
        <DialogDescription>
          Shared Claro card. Drafts are hidden from students until published.
        </DialogDescription>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.status === "retired" && card?.status !== "retired")
              setConfirmRetire(true);
            else save();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              Kind
              <select
                aria-label="Kind"
                className="field h-9 min-w-0 bg-white py-0"
                value={form.kind}
                onChange={(e) =>
                  set("kind", e.target.value as CardInput["kind"])
                }
              >
                <option value="term">Term</option>
                <option value="stat">Stat</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Status
              <select
                aria-label="Status"
                className="field h-9 min-w-0 bg-white py-0"
                value={form.status}
                onChange={(e) =>
                  set("status", e.target.value as CardInput["status"])
                }
              >
                <option value="draft">Draft</option>
                <option value="live">Live</option>
                <option value="retired">Retired</option>
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Topic
            <select
              aria-label="Topic"
              required
              className="field h-9 min-w-0 truncate bg-white py-0 pr-8"
              value={form.topic_id}
              onChange={(e) => set("topic_id", e.target.value)}
            >
              <option value="">Choose a subtopic</option>
              {topics
                .filter((t) => t.parent_id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {name(t.parent_id)} · {t.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Front
            <Input
              aria-label="Front"
              required
              maxLength={FRONT_MAX}
              value={form.front}
              onChange={(e) => set("front", e.target.value)}
            />
            <span className="text-muted-foreground text-right text-xs tabular-nums">
              {form.front.length}/{FRONT_MAX}
            </span>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Back
            <Textarea
              aria-label="Back"
              required
              rows={4}
              maxLength={BACK_MAX}
              value={form.back}
              onChange={(e) => set("back", e.target.value)}
            />
            <span className="text-muted-foreground text-right text-xs tabular-nums">
              {form.back.length}/{BACK_MAX}
            </span>
          </label>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : error ? "Try again" : "Save"}
            </Button>
          </div>
        </form>
        <RetireConfirmation
          open={confirmRetire}
          count={1}
          pending={pending}
          onClose={() => setConfirmRetire(false)}
          onConfirm={save}
        />
      </DialogContent>
    </Dialog>
  );
}

/** §4.5 list: sortable, paged, bulk publish/retire/move; a row opens the edit Dialog. */
export function FlashcardsTable({
  rows,
  pager,
  topics,
  status,
}: {
  rows: FlashcardRow[];
  pager: Pager;
  topics: Topic[];
  status: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CardInput | null>(null);
  const [move, setMove] = useState<{ ids: string[]; clear: () => void } | null>(
    null,
  );
  const [topic, setTopic] = useState("");
  const [failure, setFailure] = useState<{
    message: string;
    ids: string[];
    action: Parameters<typeof bulkFlashcards>[1];
    clear: () => void;
  } | null>(null);
  const [retiring, setRetiring] = useState<{
    ids: string[];
    clear: () => void;
  } | null>(null);
  const [pending, start] = useTransition();
  const name = (id: string | null) =>
    topics.find((t) => t.id === id)?.name ?? id ?? "";
  const run = (
    ids: string[],
    action: Parameters<typeof bulkFlashcards>[1],
    clear: () => void,
  ) =>
    start(async () => {
      setFailure(null);
      const r = await bulkFlashcards(ids, action).catch(() => ({
        error: "Try again.",
      }));
      if ("error" in r) {
        setMove(null);
        setRetiring(null);
        setFailure({
          message: r.error ?? "Could not update the cards.",
          ids,
          action,
          clear,
        });
        return;
      }
      const message = `${r.done} ${{ publish: "published", retire: "retired", topic: "moved" }[action.kind]}`;
      if (r.previous.length)
        undoToast(message, r.previous, r.version, () => router.refresh());
      else toast.success(message);
      clear();
      setMove(null);
      setRetiring(null);
      router.refresh();
    });
  const edit = (c: FlashcardRow) =>
    setEditing({
      id: c.id,
      kind: c.kind,
      topic_id: c.topic_id,
      front: c.front,
      back: c.back,
      status: c.status as CardInput["status"],
    });
  const columns: Column<FlashcardRow>[] = [
    {
      id: "front",
      className: "whitespace-normal sm:min-w-40",
      header: "Front",
      sort: true,
      cell: (c) => (
        <button
          type="button"
          className="line-clamp-2 max-w-32 text-left break-normal [overflow-wrap:anywhere] whitespace-normal sm:max-w-xs"
          onClick={() => edit(c)}
          aria-label={`Edit ${c.front}`}
        >
          {c.front}
        </button>
      ),
    },
    {
      id: "back",
      className: "hidden min-w-40 whitespace-normal sm:table-cell",
      header: "Back",
      sort: true,
      cell: (c) => (
        <span className="line-clamp-2 max-w-sm break-normal [overflow-wrap:anywhere] whitespace-normal">
          {c.back}
        </span>
      ),
    },
    {
      id: "kind",
      className: "hidden xl:table-cell",
      header: "Kind",
      sort: true,
      cell: (c) => KIND[c.kind],
    },
    {
      id: "topic",
      className: "hidden max-w-48 whitespace-normal sm:table-cell",
      header: "Topic",
      sort: true,
      cell: (c) => name(c.topic_id),
    },
    {
      id: "status",
      header: "Status",
      sort: true,
      cell: (c) => <StatusPill pill={STATUS_PILL[c.status]} />,
    },
    {
      id: "origin",
      className: "hidden xl:table-cell",
      header: "Origin",
      sort: true,
      cell: (c) => ORIGIN[c.origin as keyof typeof ORIGIN] ?? c.origin,
    },
    {
      id: "reviews",
      className: "hidden 2xl:table-cell",
      header: "Reviews",
      sort: true,
      cell: (c) => c.reviews,
    },
    {
      id: "knew",
      className: "hidden 2xl:table-cell",
      header: "% knew first try",
      sort: true,
      cell: (c) => (c.knew_first == null ? "No reviews" : `${c.knew_first}%`),
    },
    {
      id: "avg",
      className: "hidden 2xl:table-cell",
      header: "Avg rating",
      sort: true,
      cell: (c) => (c.avg == null ? "No reviews" : `${c.avg}%`),
    },
    {
      id: "updated",
      className: "hidden 2xl:table-cell",
      header: "Updated",
      sort: true,
      cell: (c) => dateLabel(c.updated_at, true),
    },
  ];
  return (
    <>
      <DataTable
        label="Flashcards"
        columns={columns}
        rows={rows}
        pager={pager}
        onRow={edit}
        bulk={(ids, clear) => (
          <>
            {status !== "live" && (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(ids, { kind: "publish" }, clear)}
              >
                Publish
              </Button>
            )}
            {status !== "retired" && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => setRetiring({ ids, clear })}
              >
                Retire
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setTopic("");
                setMove({ ids, clear });
              }}
            >
              Move to topic
            </Button>
          </>
        )}
      />
      {failure && (
        <Card className="p-5">
          <p role="alert">{failure.message}</p>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(failure.ids, failure.action, failure.clear)}
          >
            Try again
          </Button>
        </Card>
      )}
      <RetireConfirmation
        open={!!retiring}
        count={retiring?.ids.length ?? 0}
        pending={pending}
        onClose={() => setRetiring(null)}
        onConfirm={() =>
          retiring && run(retiring.ids, { kind: "retire" }, retiring.clear)
        }
      />
      {editing && (
        <CardDialog
          card={editing}
          topics={topics}
          onClose={() => setEditing(null)}
        />
      )}
      <Dialog open={!!move} onOpenChange={(o) => !o && setMove(null)}>
        <DialogContent>
          <DialogTitle>Move to topic</DialogTitle>
          <DialogDescription>
            Applies to {move?.ids.length} selected card
            {move?.ids.length === 1 ? "" : "s"}.
          </DialogDescription>
          <label className="grid gap-1 text-sm font-medium">
            Subtopic
            <select
              aria-label="Subtopic"
              className="field h-9 min-w-0 bg-white py-0"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            >
              <option value="">Choose a subtopic</option>
              {topics
                .filter((t) => t.parent_id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {name(t.parent_id)} · {t.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMove(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !topic}
              onClick={() =>
                move &&
                run(move.ids, { kind: "topic", topic_id: topic }, move.clear)
              }
            >
              Move
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "Add card" header action. */
export function AddCard({ topics }: { topics: Topic[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add card</Button>
      {open && (
        <CardDialog
          card={EMPTY}
          topics={topics}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
