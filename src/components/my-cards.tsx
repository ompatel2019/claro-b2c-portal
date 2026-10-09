"use client";
import { useState, useTransition, useActionState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  deleteMyCards,
  undoDeleteMyCards,
  moveMyCards,
  exportMyCards,
  loadMyCardFronts,
} from "@/app/(app)/flashcards/my-card-actions";
import { startFlashcards } from "@/app/(app)/flashcards/actions";
import { DECK_DEFAULTS } from "@/lib/deck";
import type { MyCardRow } from "@/lib/my-card-data";
import { OWN_FLASHCARD_LIMIT } from "@/lib/limits";
import { dateLabel, plural, type Topic } from "@/lib/practice";
import { PageHeader } from "./page-header";
import { EmptyState } from "./empty-state";
import { Cards, More } from "./icons";
import { Button, buttonVariants } from "./ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "./ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { CardEditor, Choose, topicOptions } from "./card-editor";
import { CardImportDialog } from "./card-import-dialog";
const HEADERS = [
  "Front",
  "Back",
  "Topic",
  "Kind",
  "Seen / %",
  "Next due",
  "Updated",
];
export function MyCards({
  rows,
  topics,
  total,
  page,
  pageCount,
  params,
  children,
}: {
  rows: MyCardRow[];
  topics: Topic[];
  total: number;
  page: number;
  pageCount: number;
  params: Record<string, string>;
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<MyCardRow | "new" | null>(null);
  const [importing, setImporting] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const [moving, setMoving] = useState(false);
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [deck, deckAction, starting] = useActionState(startFlashcards, {});
  const full = total >= OWN_FLASHCARD_LIMIT;
  const pageLink = (to: number) =>
    `/student/flashcards/mine?${new URLSearchParams({ ...params, page: String(to) })}`;
  const pick = (id: string, checked: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  /** Runs a server action; errors show inline, success closes the overlay. */
  const run = (
    action: () => Promise<{ ids?: string[]; error?: string }>,
    done: (ids: string[]) => void,
    failure: string,
  ) =>
    start(async () => {
      try {
        const result = await action();
        if (result.error) return setError(result.error);
        setSelected(new Set());
        setError("");
        done(result.ids ?? []);
      } catch {
        setError(failure);
      }
    });
  const remove = () =>
    run(
      () => deleteMyCards(deleting ?? []),
      (ids) => {
        setDeleting(null);
        toast.success(`${plural(ids.length, "card")} deleted.`, {
          duration: 4000,
          action: {
            label: "Undo",
            onClick: async () => {
              const undo = await undoDeleteMyCards(ids);
              if (undo.error) toast.error(undo.error);
              else {
                toast.success("Deletion undone.", { duration: 4000 });
              }
            },
          },
        });
      },
      "Couldn't delete your cards. Try again.",
    );
  const move = () =>
    run(
      () => moveMyCards([...selected], topic),
      (ids) => {
        setMoving(false);
        toast.success(`${plural(ids.length, "card")} moved.`, {
          duration: 4000,
        });
      },
      "Couldn't move your cards. Try again.",
    );
  const exportCsv = () =>
    start(async () => {
      const result: { csv?: string; error?: string } = await exportMyCards(
        params,
      ).catch(() => ({ error: "Couldn't export your cards. Try again." }));
      if (result.csv === undefined) {
        toast.error(result.error);
        return;
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(
        new Blob(["﻿", result.csv], { type: "text/csv;charset=utf-8" }),
      );
      link.download = "my-cards.csv";
      link.click();
      URL.revokeObjectURL(link.href);
    });
  const openImport = () =>
    start(async () => {
      const result: { fronts?: string[]; error?: string } =
        await loadMyCardFronts().catch(() => ({
          error: "Couldn't load your cards. Try again.",
        }));
      if (result.fronts) setImporting(result.fronts);
      else toast.error(result.error);
    });
  const actions = (
    <>
      <Button variant="outline" onClick={openImport} disabled={pending || full}>
        Import
      </Button>
      <Button onClick={() => setEditor("new")} disabled={pending || full}>
        Add card
      </Button>
    </>
  );
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="My cards"
        description="Make, import and manage your own flashcards."
        actions={
          <>
            {actions}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="My cards options"
                  />
                }
              >
                <More />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={exportCsv}
                  disabled={pending || !rows.length}
                >
                  Export CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      {children}
      {full && (
        <p role="status">
          You&apos;ve reached 2,000 cards. Delete some to add more.
        </p>
      )}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3">
          <p className="text-sm">{selected.size} selected</p>
          <form action={deckAction}>
            {[...selected].map((id) => (
              <input key={id} type="hidden" name="card_ids" value={id} />
            ))}
            <input type="hidden" name="mode" value={DECK_DEFAULTS.mode} />
            <Button type="submit" disabled={starting || pending}>
              Start deck from selected
            </Button>
          </form>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              setError("");
              setMoving(true);
            }}
          >
            Move to topic
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              setError("");
              setDeleting([...selected]);
            }}
          >
            Delete
          </Button>
        </div>
      )}
      {deck.error && (
        <p role="alert" className="text-destructive">
          {deck.error}
        </p>
      )}
      {!rows.length ? (
        <EmptyState
          icon={Cards}
          title={total ? "No cards match" : "No cards yet"}
          description={
            total
              ? "Try a different search or clear your filters."
              : "Make one, or import from Anki or Quizlet."
          }
          action={
            !total && <div className="flex flex-wrap gap-2">{actions}</div>
          }
        />
      ) : (
        <div className="min-w-0 overflow-hidden rounded-2xl border bg-white">
          <Table aria-label="My cards">
            <TableHeader>
              <TableRow>
                <TableHead>
                  <input
                    type="checkbox"
                    aria-label="Select all cards on this page"
                    ref={(input) => {
                      if (input)
                        input.indeterminate =
                          rows.some((r) => selected.has(r.id)) &&
                          !rows.every((r) => selected.has(r.id));
                    }}
                    checked={rows.every((r) => selected.has(r.id))}
                    onChange={(e) =>
                      setSelected(
                        new Set(e.target.checked ? rows.map((r) => r.id) : []),
                      )
                    }
                  />
                </TableHead>
                {HEADERS.map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((card) => (
                <TableRow key={card.id} data-card-id={card.id} className="h-14">
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Select ${card.front}`}
                      checked={selected.has(card.id)}
                      onChange={(e) => pick(card.id, e.target.checked)}
                    />
                  </TableCell>
                  <TableCell className="max-w-64 min-w-40 whitespace-normal">
                    <button
                      className="line-clamp-2 text-left font-medium"
                      onClick={() => setEditor(card)}
                    >
                      {card.front}
                    </button>
                  </TableCell>
                  <TableCell className="max-w-64 min-w-40 whitespace-normal">
                    <span className="line-clamp-2">{card.back}</span>
                  </TableCell>
                  <TableCell>
                    {topics.find((t) => t.id === card.topic_id)?.name ??
                      card.topic_id}
                  </TableCell>
                  <TableCell>
                    {card.kind === "term" ? "Term" : "Stat"}
                  </TableCell>
                  <TableCell>
                    {card.seen} /{" "}
                    {card.percent === null ? "New" : `${card.percent}%`}
                  </TableCell>
                  <TableCell>
                    {card.due ? dateLabel(card.due, true) : "Not reviewed"}
                  </TableCell>
                  <TableCell>{dateLabel(card.updated_at, true)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${card.front}`}
                          />
                        }
                      >
                        <More />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditor(card)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setError("");
                            setDeleting([card.id]);
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {pageCount > 1 && (
        <nav
          aria-label="My cards pages"
          className="flex flex-wrap items-center justify-between gap-2"
        >
          <span className="text-muted-foreground text-sm">
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={pageLink(page - 1)}
              >
                Previous
              </Link>
            )}
            {page < pageCount && (
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={pageLink(page + 1)}
              >
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
      {editor && (
        <CardEditor
          card={editor === "new" ? undefined : editor}
          topics={topics}
          onClose={() => setEditor(null)}
        />
      )}
      {importing && (
        <CardImportDialog
          topics={topics}
          ownFronts={importing}
          onClose={() => setImporting(null)}
        />
      )}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            Delete {plural(deleting?.length ?? 0, "card")}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            These cards will be removed from your decks. You can undo this from
            the toast.
          </AlertDialogDescription>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={remove}>
              Delete cards
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={moving}
        onOpenChange={(open) => {
          if (!pending) setMoving(open);
        }}
      >
        <DialogContent>
          <DialogTitle>Move {plural(selected.size, "card")}</DialogTitle>
          <DialogDescription>
            Choose the subtopic for the selected cards.
          </DialogDescription>
          <Choose
            label="Topic"
            value={topic}
            options={topicOptions(topics)}
            placeholder="Choose a subtopic"
            onChange={setTopic}
          />
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <Button disabled={!topic || pending} onClick={move}>
            Move cards
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
