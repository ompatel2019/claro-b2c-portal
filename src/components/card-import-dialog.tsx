"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  importMyCards,
  deleteMyCards,
} from "@/app/(app)/flashcards/my-card-actions";
import {
  detectSeparator,
  normaliseFront,
  parseCards,
  reviewImport,
  type Mapping,
  type CardInput,
  type Separator,
} from "@/lib/card-import";
import { plural, type Topic } from "@/lib/practice";
import { CARD_IMPORT_BYTE_LIMIT } from "@/lib/limits";
import { DataTable } from "./data-table";
import type { ReviewedRecord } from "@/lib/flashcard-import";
import { Choose, KINDS, topicOptions } from "./card-editor";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Input } from "./ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
const SEPARATORS = [
  { value: "auto", label: "Auto" },
  { value: "\t", label: "Tab" },
  { value: ",", label: "Comma" },
  { value: ";", label: "Semicolon" },
];
const FIELDS = ["front", "back", "topic", "kind"] as const;
/** Shared mode keeps the student flow intact and delegates admin reads/writes to guarded actions. */
type SharedImport = {
  review: (records: unknown) => Promise<ReviewedRecord[]>;
  save: (
    records: unknown,
  ) => Promise<{ error?: string; ids?: string[]; version?: string }>;
  undo: (
    ids: string[],
    version: string,
  ) => Promise<{ done: number; total: number }>;
};
export function CardImportDialog({
  topics,
  ownFronts,
  onClose,
  shared,
}: {
  topics: Topic[];
  ownFronts: string[];
  shared?: SharedImport;
  onClose: () => void;
}) {
  const [step, setStep] = useState(1);
  const [text, setText] = useState("");
  const [separator, setSeparator] = useState("auto");
  const [header, setHeader] = useState(true);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({
    front: 0,
    back: 1,
    topic: -1,
    kind: -1,
  });
  const [topic, setTopic] = useState("");
  const [kind, setKind] = useState<"term" | "stat">("term");
  const [review, setReview] = useState<ReturnType<typeof reviewImport>>([]);
  const [included, setIncluded] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const count = (status: string) =>
    review.filter((r) => r.status === status).length;
  const next = () => {
    try {
      setError("");
      if (step === 1) {
        const parsed = parseCards(
          text,
          separator === "auto"
            ? detectSeparator(text)
            : (separator as Separator),
        );
        if (!parsed.length) throw new Error("Paste or upload some cards.");
        setRows(parsed);
        const width = Math.max(...parsed.map((r) => r.length));
        setMapping((m) => ({
          front: m.front < width ? m.front : -1,
          back: m.back < width ? m.back : -1,
          topic: m.topic < width ? m.topic : -1,
          kind: m.kind < width ? m.kind : -1,
        }));
      } else {
        const checked = reviewImport(
          header ? rows.slice(1) : rows,
          mapping,
          { topic_id: topic, kind },
          topics,
          ownFronts,
        );
        if (shared) {
          start(async () => {
            try {
              const result = await shared.review(checked.map((r) => r.card));
              const reviewed = result.map((r, index) => ({
                index,
                card: {
                  front: r.front,
                  back: r.back,
                  topic_id: r.topic_id,
                  kind: r.kind,
                } as CardInput,
                status:
                  r.status === "ready"
                    ? "Ready"
                    : r.status === "duplicate"
                      ? "Duplicate"
                      : "Invalid",
                error: r.reason || null,
              }));
              setReview(reviewed);
              setIncluded(
                new Set(
                  reviewed
                    .filter((r) => r.status === "Ready")
                    .map((r) => r.index),
                ),
              );
              setStep(3);
            } catch {
              setError("Couldn't check these rows. Try again.");
            }
          });
          return;
        }
        setReview(checked);
        setIncluded(
          new Set(
            checked.filter((r) => r.status === "Ready").map((r) => r.index),
          ),
        );
      }
      setStep(step + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const submit = () =>
    start(async () => {
      try {
        const cards = review
          .filter((r) => included.has(r.index))
          .map((r) => r.card);
        const result = shared
          ? await shared.save(cards)
          : await importMyCards(cards);
        if (result.error) return setError(result.error);
        const ids = result.ids ?? [];
        toast.success(
          shared
            ? `Imported ${ids.length} cards as drafts`
            : `${plural(ids.length, "card")} imported.`,
          {
            duration: 10000,
            action: {
              label: "Undo",
              onClick: async () => {
                if (shared) {
                  try {
                    const undone = await shared.undo(
                      ids,
                      "version" in result ? (result.version ?? "") : "",
                    );
                    toast.success(
                      undone.done !== undone.total
                        ? `Removed ${undone.done} cards. Later edits kept.`
                        : "Import undone",
                      { duration: 4000 },
                    );
                  } catch {
                    toast.error("Couldn't undo the import. Try again.");
                  }
                  return;
                }
                const undone = await deleteMyCards(ids);
                if (undone.error) toast.error(undone.error);
                else toast.success("Import undone.", { duration: 4000 });
              },
            },
          },
        );
        onClose();
      } catch {
        setError("Couldn't import your cards. Try again.");
      }
    });
  const chosenCount = shared
    ? new Set(
        review
          .filter((r) => included.has(r.index))
          .map((r) => `${r.card.kind}|${normaliseFront(r.card.front)}`),
      ).size
    : included.size;
  const width = Math.max(0, ...rows.map((r) => r.length));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] min-w-0 overflow-y-auto sm:max-w-2xl">
        <DialogTitle aria-live="polite">
          Import cards · {shared ? "step" : "Step"} {step} of 3
        </DialogTitle>
        <DialogDescription>
          {step === 1
            ? `Paste text or upload a .txt, .csv or .tsv file (1 MB, 500 rows maximum).${shared ? " Rows land as drafts." : ""}`
            : step === 2
              ? "Map the columns and choose defaults."
              : "Review your cards before importing."}
        </DialogDescription>
        {step === 1 && (
          <div className="grid gap-3">
            <label className="grid min-w-0 gap-1">
              Paste text
              <Textarea
                aria-label="Paste text"
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <label className="grid min-w-0 gap-1">
              Upload file
              <Input
                type="file"
                accept=".txt,.csv,.tsv"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > CARD_IMPORT_BYTE_LIMIT) {
                    setError("Files must be 1 MB or smaller.");
                    return;
                  }
                  setError("");
                  if (shared) {
                    try {
                      setText(await file.text());
                    } catch {
                      setError("Couldn't read this file. Try again.");
                    }
                    return;
                  }
                  setText(await file.text());
                }}
              />
            </label>
            <Choose
              label="Separator"
              value={separator}
              options={SEPARATORS}
              onChange={setSeparator}
            />
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={header}
                onChange={(e) => setHeader(e.target.checked)}
              />
              First row is a header
            </label>
            <p className="text-muted-foreground text-xs">
              From Anki: File → Export → Notes in Plain Text. From Quizlet:
              Export → copy the text.
            </p>
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-3">
            {FIELDS.map((field) => {
              const optional = field === "topic" || field === "kind";
              return (
                <Choose
                  key={field}
                  label={`${field[0].toUpperCase()}${field.slice(1)} column`}
                  value={
                    mapping[field] < 0 && !optional
                      ? ""
                      : String(mapping[field])
                  }
                  placeholder="Choose a column"
                  options={[
                    ...(optional
                      ? [{ value: "-1", label: "Use default" }]
                      : []),
                    ...Array.from({ length: width }, (_, i) => ({
                      value: String(i),
                      label: `Column ${i + 1}${header ? ` · ${rows[0][i] ?? ""}` : ""}`,
                    })),
                  ]}
                  onChange={(v) =>
                    setMapping((m) => ({ ...m, [field]: Number(v) }))
                  }
                />
              );
            })}
            <Choose
              label="Default topic"
              value={topic}
              options={topicOptions(topics)}
              placeholder="Choose a subtopic"
              onChange={setTopic}
            />
            <Choose
              label="Default kind"
              value={kind}
              options={KINDS}
              onChange={(v) => setKind(v as typeof kind)}
            />
          </div>
        )}
        {step === 3 && (
          <div className="min-w-0 space-y-3">
            <p>
              {count("Ready")} ready · {count("Duplicate")} duplicates ·{" "}
              {count("Invalid")} invalid
            </p>
            <div className="max-h-64 overflow-auto rounded-2xl border">
              {shared ? (
                <DataTable
                  label="Import review"
                  rows={review.map((r) => ({ ...r, id: String(r.index) }))}
                  columns={[
                    {
                      id: "include",
                      header: "Include",
                      cell: (r) => (
                        <input
                          type="checkbox"
                          className="accent-primary size-4"
                          aria-label={`Include row ${r.index + 1}`}
                          disabled={
                            pending ||
                            r.status === "Invalid" ||
                            r.error === "Already a Claro card"
                          }
                          checked={included.has(r.index)}
                          onChange={(e) =>
                            setIncluded((s) => {
                              const n = new Set(s);
                              if (e.target.checked) n.add(r.index);
                              else n.delete(r.index);
                              return n;
                            })
                          }
                        />
                      ),
                    },
                    {
                      id: "front",
                      header: "Front",
                      cell: (r) => (
                        <span className="line-clamp-2 max-w-24 [overflow-wrap:anywhere] whitespace-normal sm:max-w-xs">
                          {r.card.front || "Empty front"}
                        </span>
                      ),
                    },
                    {
                      id: "back",
                      header: "Back",
                      className: "hidden sm:table-cell",
                      cell: (r) => (
                        <span className="line-clamp-2 max-w-xs [overflow-wrap:anywhere] whitespace-normal">
                          {r.card.back}
                        </span>
                      ),
                    },
                    {
                      id: "status",
                      header: "Status",
                      cell: (r) => (
                        <span className="block max-w-28 [overflow-wrap:anywhere] whitespace-normal">
                          {r.status}
                          {r.error && ` · ${r.error}`}
                        </span>
                      ),
                    },
                  ]}
                />
              ) : (
                <Table aria-label="Import review">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Include</TableHead>
                      <TableHead>Front</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {review.map((r) => (
                      <TableRow key={r.index}>
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={`Include row ${r.index + 1}`}
                            disabled={r.status !== "Ready"}
                            checked={included.has(r.index)}
                            onChange={(e) =>
                              setIncluded((s) => {
                                const n = new Set(s);
                                if (e.target.checked) n.add(r.index);
                                else n.delete(r.index);
                                return n;
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="max-w-64 truncate">
                          {r.card.front || "Empty front"}
                        </TableCell>
                        <TableCell>
                          {r.status}
                          {r.error && ` · ${r.error}`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {step > 1 && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                setStep(step - 1);
                setError("");
              }}
            >
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button onClick={next} disabled={shared && pending}>
              {shared && step === 2
                ? pending
                  ? "Checking…"
                  : error
                    ? "Try again"
                    : "Review"
                : "Next"}
            </Button>
          ) : (
            <Button disabled={pending || !included.size} onClick={submit}>
              {shared && pending
                ? "Importing…"
                : shared && error
                  ? "Try again"
                  : `Import ${plural(chosenCount, "card")}`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
