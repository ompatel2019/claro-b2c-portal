"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useOnline } from "@/lib/use-online";
import { createClient } from "@/utils/supabase/client";
import { FormField } from "./form-field";
import { toast } from "sonner";
import { Alert, ChevronDown, ChevronUp, Close, Plus } from "@/components/icons";
import {
  savePaper,
  searchBank,
  undoRetirePapers,
} from "@/app/admin/content/papers/actions";
import type { loadPaper } from "@/lib/admin-papers";
import {
  makeChoice,
  choiceCaption,
  move,
  paperSchema,
  paperBackupSchema,
  publishPaperProblems,
  READING_MIN,
  TIME_LIMITS,
  totalMarks,
  tidyChoices,
  ungroup,
  type PaperInput,
  type PaperQuestion,
  type Section,
} from "@/lib/paper-builder";
import { plural, type Topic } from "@/lib/practice";
import { ORIGIN_LABELS, TYPE_LABELS } from "@/lib/question-bank";
import { cn } from "@/lib/utils";
import { SessionShell } from "./session-shell";
import { QuestionView } from "./question-view";
import { StatusPill, STATUS_PILL } from "./status-pill";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button, buttonVariants } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";

type Loaded = NonNullable<Awaited<ReturnType<typeof loadPaper>>>;
type Stems = Loaded["stems"];
type BankRow = Awaited<ReturnType<typeof searchBank>>["rows"][number];

/** §4.6 builder: details, sections with ordered questions, choice groups, ranks, status and the student preview. */
export function PaperBuilder({
  loaded,
  topics,
}: {
  loaded: Loaded;
  topics: Topic[];
}) {
  const router = useRouter();
  const { paper } = loaded;
  const [form, setForm] = useState<PaperInput>({
    title: paper.title,
    year: paper.year,
    source: paper.source,
    time_limit_min: paper.time_limit_min,
    ranks_enabled: paper.ranks_enabled,
    sections: loaded.sections,
  });
  const [stems, setStems] = useState<Stems>(loaded.stems);
  const [dirty, setDirty] = useState(false);
  const online = useOnline();
  const queued = useRef(false);
  const editVersion = useRef(0);
  const backupKey = `paper-builder:${loaded.adminId}:${paper.id}`;
  const [restore, setRestore] = useState<{
    form: PaperInput;
    stems: Stems;
  } | null>(null);
  const [expired, setExpired] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signInError, setSignInError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [picker, setPicker] = useState<number | null>(null);
  const [selected, setSelected] = useState<Record<number, string[]>>({});
  const [confirm, setConfirm] = useState<"publish" | "retire" | null>(null);
  const [removingQuestion, setRemovingQuestion] = useState<{
    section: number;
    id: string;
  } | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  const [pending, start] = useTransition();
  const status = paper.status as "draft" | "live" | "retired";
  const locked = status !== "draft" && loaded.started > 0;
  const total = totalMarks(form.sections);
  const name = (id: string) => topics.find((t) => t.id === id)?.name ?? id;
  const publish = publishPaperProblems(form);
  const inPaper = new Set(
    form.sections.flatMap((s) => s.questions.map((q) => q.question_id)),
  );

  const update = (patch: Partial<PaperInput>) => {
    editVersion.current++;
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
  };
  const setSection = (i: number, section: Section) =>
    update({ sections: form.sections.map((s, j) => (j === i ? section : s)) });

  function removeWithUndo(sections: Section[], message: string) {
    const previous = form.sections;
    update({ sections });
    const version = editVersion.current;
    setSelected({});
    toast.success(message, {
      action: {
        label: "Undo",
        onClick: () => {
          if (editVersion.current !== version) {
            toast.error("Couldn't undo. Later edits kept.");
            return;
          }
          update({ sections: previous });
        },
      },
    });
  }

  useEffect(() => {
    // Restore only this admin's form after re-authentication or a reload.
    const id = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(backupKey);
        const parsed =
          stored && paperBackupSchema.safeParse(JSON.parse(stored));
        if (parsed && parsed.success) setRestore(parsed.data);
      } catch {
        /* Ignore unavailable or invalid storage. */
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [backupKey]);

  useEffect(() => {
    if (!dirty) return;
    try {
      localStorage.setItem(backupKey, JSON.stringify({ form, stems }));
    } catch {
      /* Storage is optional. */
    }
  }, [backupKey, dirty, form, stems]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function save(next: typeof status = status, publishDrafts = false) {
    if (pending) return;
    if (!navigator.onLine) {
      queued.current = next === status;
      return;
    }
    const parsed = paperSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ]),
        ),
      );
      return setErrors([
        ...new Set(parsed.error.issues.map((issue) => issue.message)),
      ]);
    }
    setFieldErrors({});
    if (next === "live" && publish.problems.length)
      return setErrors(publish.problems);
    setErrors([]);
    start(async () => {
      const { data, error } = await createClient().auth.getUser();
      if (!data.user && !error?.message?.includes("fetch")) {
        setExpired(true);
        return;
      }
      const r = await savePaper(
        paper.id,
        parsed.data,
        next,
        publishDrafts,
        paper.updated_at,
      ).catch(() => ({
        error: "Couldn’t save. Try again.",
      }));
      if ("error" in r) return setErrors([r.error]);
      setDirty(false);
      try {
        localStorage.removeItem(backupKey);
      } catch {
        /* Storage is optional. */
      }
      setConfirm(null);
      toast.success(
        next === status
          ? "Saved"
          : next === "live"
            ? "Paper is live"
            : "Paper retired",
        "undo" in r && r.undo
          ? {
              action: {
                label: "Undo",
                onClick: () => {
                  void undoRetirePapers(r.undo!)
                    .then(() => {
                      toast.success("Retirement undone");
                      router.refresh();
                    })
                    .catch(() => toast.error("Couldn't undo. Try again."));
                },
              },
            }
          : undefined,
      );
      router.refresh();
    });
  }
  useEffect(() => {
    const retry = () => {
      if (!queued.current) return;
      queued.current = false;
      save();
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  });
  let position = 0;
  return (
    <fieldset
      disabled={pending}
      aria-label="Paper builder"
      className="min-w-0 space-y-4 [overflow-wrap:anywhere]"
    >
      {!online && (
        <p role="status" className="bg-muted rounded-xl px-4 py-2 text-sm">
          {"You're offline. We'll save when you're back."}
        </p>
      )}
      {restore && (
        <Card>
          <CardContent className="space-y-2">
            <p>Unsaved changes from this browser are available.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setForm(
                    locked
                      ? {
                          ...form,
                          title: restore.form.title,
                          ranks_enabled: restore.form.ranks_enabled,
                        }
                      : restore.form,
                  );
                  if (!locked) setStems(restore.stems);
                  setDirty(true);
                  setRestore(null);
                }}
              >
                Restore changes
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  try {
                    localStorage.removeItem(backupKey);
                  } catch {
                    /* Storage is optional. */
                  }
                  setRestore(null);
                }}
              >
                Discard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {locked && (
        <p role="status" className="bg-muted rounded-xl px-4 py-3 text-sm">
          {plural(loaded.started, "sit")} started. Questions and timing are
          locked; title and ranks still change.
        </p>
      )}
      {errors.length > 0 && (
        <Card>
          <CardContent>
            <ul
              role="alert"
              className="bg-destructive-soft text-destructive list-disc rounded-xl py-3 pr-4 pl-8 text-sm"
            >
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <FormField label="Title" error={fieldErrors.title}>
            <Input
              maxLength={80}
              value={form.title}
              onChange={(e) => update({ title: e.target.value })}
            />
          </FormField>
          <FormField label="Year" error={fieldErrors.year}>
            <Input
              type="number"
              disabled={locked}
              min={2000}
              max={2100}
              value={form.year ?? ""}
              onChange={(e) =>
                update({ year: e.target.value ? Number(e.target.value) : null })
              }
            />
          </FormField>
          <FormField label="Source label" error={fieldErrors.source}>
            <Input
              maxLength={60}
              disabled={locked}
              placeholder="2023 HSC"
              value={form.source ?? ""}
              onChange={(e) => update({ source: e.target.value || null })}
            />
          </FormField>
          <FormField label="Time limit" error={fieldErrors.time_limit_min}>
            <select
              aria-label="Time limit"
              className="field h-9 min-w-0 bg-white py-0"
              value={form.time_limit_min}
              disabled={locked}
              onChange={(e) =>
                update({ time_limit_min: Number(e.target.value) })
              }
            >
              {TIME_LIMITS.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </FormField>
          <div className="grid gap-1 text-sm font-medium">
            Reading time
            <p className="text-muted-foreground flex h-9 items-center">
              {READING_MIN} min
            </p>
          </div>
          <div className="grid gap-1 text-sm font-medium">
            Total marks
            <p
              className={cn(
                "flex h-9 items-center tabular-nums",
                total !== 100 && "text-warning",
              )}
            >
              {total !== 100 && (
                <Alert aria-hidden className="mr-1 size-4 shrink-0" />
              )}
              {total}
              {total !== 100 && (
                <span className="ml-2 text-xs font-normal">
                  Not 100: check the paper.
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2 xl:col-span-3">
            <Switch
              aria-label="Show ranks to students"
              checked={form.ranks_enabled}
              onCheckedChange={(v) => update({ ranks_enabled: v })}
            />
            <span className="text-sm font-medium">Show ranks to students</span>
            <span className="text-muted-foreground text-xs">
              Ranks need 20 first sits. Now: {loaded.firstSits}.
            </span>
          </div>
        </CardContent>
      </Card>
      {form.sections.map((section, si) => {
        const picked = selected[si] ?? [];
        const groups = new Set<number>();
        return (
          <Card key={si}>
            <CardHeader className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={`Section ${si + 1} name`}
                className="w-56"
                maxLength={60}
                value={section.name}
                disabled={locked}
                onChange={(e) =>
                  setSection(si, { ...section, name: e.target.value })
                }
              />
              <span className="text-muted-foreground text-sm">
                {plural(section.questions.length, "question")}
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                {picked.length >= 2 && !locked && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSection(si, makeChoice(section, picked));
                      setSelected((s) => ({ ...s, [si]: [] }));
                    }}
                  >
                    Make ‘answer one of’
                  </Button>
                )}
                {!locked && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPicker(si)}
                  >
                    <Plus /> Add questions
                  </Button>
                )}
                {!locked && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove section ${si + 1}`}
                    disabled={form.sections.length === 1}
                    onClick={() => setRemoving(si)}
                  >
                    <Close />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {section.questions.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No questions yet.
                </p>
              ) : (
                <ul className="divide-y divide-dashed">
                  {section.questions.map((q, qi) => {
                    position++;
                    const first =
                      q.choice_group != null && !groups.has(q.choice_group);
                    if (q.choice_group != null) groups.add(q.choice_group);
                    return (
                      <li key={q.question_id} className="py-2">
                        {first && (
                          <p className="text-muted-foreground mb-1 flex flex-wrap items-center gap-2 text-xs font-medium">
                            {choiceCaption(
                              section,
                              q.choice_group!,
                              position - qi - 1,
                            )}
                            {!locked && (
                              <button
                                type="button"
                                className="underline"
                                onClick={() =>
                                  setSection(
                                    si,
                                    ungroup(section, q.choice_group!),
                                  )
                                }
                              >
                                Ungroup
                              </button>
                            )}
                          </p>
                        )}
                        <div
                          className={cn(
                            "flex flex-wrap items-center gap-3 text-sm",
                            q.choice_group != null &&
                              "border-ink/30 ml-1 border-l-2 pl-3",
                          )}
                          draggable={!locked}
                          onDragStart={(e) =>
                            e.dataTransfer.setData("text/plain", `${si}:${qi}`)
                          }
                          onDragOver={(e) => !locked && e.preventDefault()}
                          onDrop={(e) => {
                            if (locked) return;
                            e.preventDefault();
                            const [sectionIndex, from] = e.dataTransfer
                              .getData("text/plain")
                              .split(":")
                              .map(Number);
                            if (sectionIndex === si && Number.isInteger(from))
                              setSection(si, {
                                ...section,
                                questions: move(section.questions, from, qi),
                              });
                          }}
                        >
                          {!locked && (
                            <input
                              type="checkbox"
                              className="accent-primary size-4"
                              aria-label={`Select ${q.source} (${q.question_id})`}
                              checked={picked.includes(q.question_id)}
                              onChange={(e) =>
                                setSelected((s) => ({
                                  ...s,
                                  [si]: e.target.checked
                                    ? [...picked, q.question_id]
                                    : picked.filter((x) => x !== q.question_id),
                                }))
                              }
                            />
                          )}
                          <span
                            aria-hidden
                            className={cn(
                              "text-muted-foreground select-none",
                              !locked && "cursor-grab",
                            )}
                          >
                            ⋮⋮
                          </span>
                          <span className="w-8 font-semibold tabular-nums">
                            Q{position}
                          </span>
                          <Link
                            className="underline-offset-4 hover:underline"
                            href={`/admin/content/questions/${q.question_id}`}
                          >
                            {q.source}
                          </Link>
                          <span className="text-muted-foreground">
                            {TYPE_LABELS[q.type]}
                          </span>
                          <span className="tabular-nums">
                            {plural(q.marks, "mark")}
                          </span>
                          <span className="text-muted-foreground">
                            {name(q.topic_id)}
                          </span>
                          {q.status !== "live" && (
                            <StatusPill pill={STATUS_PILL[q.status]} />
                          )}
                          {!locked && (
                            <span className="ml-auto flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Move ${q.source} up`}
                                disabled={qi === 0}
                                onClick={() =>
                                  setSection(si, {
                                    ...section,
                                    questions: move(
                                      section.questions,
                                      qi,
                                      qi - 1,
                                    ),
                                  })
                                }
                              >
                                <ChevronUp />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Move ${q.source} down`}
                                disabled={qi === section.questions.length - 1}
                                onClick={() =>
                                  setSection(si, {
                                    ...section,
                                    questions: move(
                                      section.questions,
                                      qi,
                                      qi + 1,
                                    ),
                                  })
                                }
                              >
                                <ChevronDown />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Remove ${q.source}`}
                                onClick={() =>
                                  setRemovingQuestion({
                                    section: si,
                                    id: q.question_id,
                                  })
                                }
                              >
                                <Close />
                              </Button>
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
      {!locked && (
        <Button
          variant="outline"
          onClick={() =>
            update({
              sections: [
                ...form.sections,
                { name: `Section ${form.sections.length + 1}`, questions: [] },
              ],
            })
          }
        >
          <Plus /> Add section
        </Button>
      )}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <StatusPill pill={STATUS_PILL[status]} />
          <Button disabled={pending} onClick={() => save()}>
            {pending ? "Saving…" : errors.length ? "Try again" : "Save"}
          </Button>
          {status !== "live" && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                if (publish.problems.length) return setErrors(publish.problems);
                setErrors([]);
                setConfirm("publish");
              }}
            >
              Publish
            </Button>
          )}
          {status === "live" && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setConfirm("retire")}
            >
              Retire
            </Button>
          )}
          <Button variant="outline" onClick={() => setPreview(true)}>
            Preview as student
          </Button>
          <Link
            href="/admin/content/papers"
            className={buttonVariants({ variant: "ghost" })}
          >
            Back to papers
          </Link>
          <span className="text-muted-foreground text-xs">
            {dirty ? "Unsaved changes" : "Saved"}
          </span>
        </CardContent>
      </Card>
      {picker !== null && (
        <BankPicker
          topics={topics}
          inPaper={inPaper}
          onClose={() => setPicker(null)}
          onAdd={(rows) => {
            setStems((s) => ({
              ...s,
              ...Object.fromEntries(
                rows.map((r) => [
                  r.id,
                  { stem: r.stem, stimulus: r.stimulus, options: r.options },
                ]),
              ),
            }));
            setSelected({});
            const section = form.sections[picker];
            setSection(picker, {
              ...section,
              questions: [
                ...section.questions,
                ...rows.map((r): PaperQuestion => ({
                  question_id: r.id,
                  source: r.source,
                  type: r.type as PaperQuestion["type"],
                  marks: r.marks,
                  topic_id: r.topic_id,
                  status: r.status as PaperQuestion["status"],
                  choice_group: null,
                })),
              ],
            });
            setPicker(null);
          }}
        />
      )}
      <AlertDialog
        open={removingQuestion !== null}
        onOpenChange={(o) => !o && setRemovingQuestion(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Remove question?</AlertDialogTitle>
          <AlertDialogDescription>
            The bank question will stay available.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              onClick={() => {
                if (!removingQuestion) return;
                const { section: i, id } = removingQuestion;
                removeWithUndo(
                  form.sections.map((section, index) =>
                    index === i
                      ? tidyChoices({
                          ...section,
                          questions: section.questions.filter(
                            (q) => q.question_id !== id,
                          ),
                        })
                      : section,
                  ),
                  "Question removed",
                );
                setRemovingQuestion(null);
              }}
            >
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Remove section?</AlertDialogTitle>
          <AlertDialogDescription>
            Its questions will be removed from this paper.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              onClick={() => {
                removeWithUndo(
                  form.sections.filter((_, i) => i !== removing),
                  "Section removed",
                );
                setRemoving(null);
              }}
            >
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && !pending && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {confirm === "publish"
              ? "Publish this paper?"
              : "Retire this paper?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirm === "publish"
              ? `Publishing hides these ${plural(inPaper.size, "question")} from Topic Sprints.${
                  publish.drafts.length
                    ? ` ${plural(publish.drafts.length, "draft question")} will be published too.`
                    : ""
                }`
              : "Students can no longer start it. Sits in progress keep working."}
          </AlertDialogDescription>
          {errors.length > 0 && (
            <p role="alert" className="text-destructive text-sm">
              {errors.join(" ")}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep as is</AlertDialogCancel>
            <Button
              disabled={pending}
              onClick={() =>
                save(
                  confirm === "publish" ? "live" : "retired",
                  publish.drafts.length > 0,
                )
              }
            >
              {confirm === "publish"
                ? publish.drafts.length
                  ? `Publish ${plural(publish.drafts.length, "draft question")} too`
                  : "Publish"
                : "Retire"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={expired} onOpenChange={setExpired}>
        <DialogContent>
          <DialogTitle>Sign in to continue</DialogTitle>
          <DialogDescription>
            Your unsaved changes are kept in this browser.
          </DialogDescription>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const { error } = await createClient().auth.signInWithPassword({
                  email,
                  password,
                });
                if (error) {
                  setSignInError("Couldn't sign in. Try again.");
                  return;
                }
                setExpired(false);
                setPassword("");
                setSignInError("");
              });
            }}
          >
            <FormField label="Email">
              <Input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>
            <FormField label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
            {signInError && <p role="alert">{signInError}</p>}
            <Button disabled={pending} type="submit">
              Sign in
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-6xl"
        >
          <DialogTitle className="sr-only">
            {form.title || "Untitled paper"} · read-only booklet
          </DialogTitle>
          <DialogDescription className="sr-only">
            {form.time_limit_min} min + {READING_MIN} min reading ·{" "}
            {plural(total, "mark")}
          </DialogDescription>
          <SessionShell
            readOnly
            title={`${form.title} · Read-only preview`}
            onExit={() => setPreview(false)}
            booklet={
              <nav aria-label="Preview sections" className="grid gap-2">
                {form.sections.map((s, i) => (
                  <a
                    key={i}
                    className="text-sm underline"
                    href={`#preview-section-${i}`}
                  >
                    {s.name}
                  </a>
                ))}
              </nav>
            }
          >
            <p className="text-muted-foreground text-sm">
              {form.time_limit_min} min + {READING_MIN} min reading ·{" "}
              {plural(total, "mark")}
            </p>
            {(() => {
              let n = 0;
              return form.sections.map((s, i) => (
                <section
                  id={`preview-section-${i}`}
                  key={i}
                  className="space-y-4"
                >
                  <h3 className="font-semibold">{s.name}</h3>
                  {s.questions.map((q, qi) => {
                    n++;
                    const st = stems[q.question_id];
                    return (
                      <div
                        key={q.question_id}
                        className="rounded-xl border p-4"
                      >
                        <p className="mb-2 text-sm font-semibold">
                          <span>Question {n}</span>
                          {q.choice_group != null && (
                            <span className="text-muted-foreground font-normal">
                              {" "}
                              · {choiceCaption(s, q.choice_group, n - qi - 1)}
                            </span>
                          )}
                        </p>
                        <QuestionView
                          stem={st?.stem ?? ""}
                          stimulus={st?.stimulus}
                          options={st?.options}
                          marks={q.marks}
                          source={q.source}
                        />
                      </div>
                    );
                  })}
                </section>
              ));
            })()}
          </SessionShell>
        </DialogContent>
      </Dialog>
    </fieldset>
  );
}

/** "Add questions" Dialog: the bank picker with multi-select and "Already in" warnings. */
function BankPicker({
  topics,
  inPaper,
  onClose,
  onAdd,
}: {
  topics: Topic[];
  inPaper: Set<string>;
  onClose: () => void;
  onAdd: (rows: BankRow[]) => void;
}) {
  const [f, setF] = useState({
    q: "",
    type: "",
    topic: "",
    from: "",
    to: "",
    origin: "",
    status: "live",
  });
  const [failure, setFailure] = useState(false);
  const [rows, setRows] = useState<BankRow[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const parents = topics.filter((t) => !t.parent_id);
  const name = (id: string) => topics.find((t) => t.id === id)?.name ?? id;
  const [bankPage, setBankPage] = useState(1);
  const [count, setCount] = useState(0);
  const search = (page = 1) =>
    start(async () => {
      try {
        setFailure(false);
        setChosen([]);
        setRows(null);
        const result = await searchBank(
          {
            q: f.q || undefined,
            type: f.type || undefined,
            topic: f.topic || undefined,
            from: f.from ? Number(f.from) : undefined,
            to: f.to ? Number(f.to) : undefined,
            origin: f.origin || undefined,
            status: f.status || undefined,
          },
          page,
        );
        setRows(result.rows);
        setBankPage(result.page);
        setCount(result.count);
      } catch {
        setFailure(true);
      }
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto [overflow-wrap:anywhere] sm:max-w-3xl">
        <DialogTitle>Add questions</DialogTitle>
        <DialogDescription>
          Pick from the bank. Questions already in another paper are flagged.
        </DialogDescription>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <label className="grid gap-1 text-xs font-medium">
            Search
            <Input
              className="w-44"
              aria-label="Search bank"
              value={f.q}
              onChange={(e) => setF({ ...f, q: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Type
            <select
              className="field h-9 bg-white py-0"
              aria-label="Type"
              value={f.type}
              onChange={(e) => setF({ ...f, type: e.target.value })}
            >
              <option value="">Any</option>
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Topic
            <select
              className="field h-9 max-w-48 bg-white py-0"
              aria-label="Topic"
              value={f.topic}
              onChange={(e) => setF({ ...f, topic: e.target.value })}
            >
              <option value="">Any</option>
              {parents.flatMap((p) => [
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>,
                ...topics
                  .filter((t) => t.parent_id === p.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      · {t.name}
                    </option>
                  )),
              ])}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium">
            From
            <Input
              className="w-20"
              inputMode="numeric"
              value={f.from}
              onChange={(e) => setF({ ...f, from: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium">
            To
            <Input
              className="w-20"
              inputMode="numeric"
              value={f.to}
              onChange={(e) => setF({ ...f, to: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Origin
            <select
              className="field h-9 bg-white py-0"
              aria-label="Origin"
              value={f.origin}
              onChange={(e) => setF({ ...f, origin: e.target.value })}
            >
              <option value="">Any</option>
              {Object.entries(ORIGIN_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Status
            <select
              className="field h-9 bg-white py-0"
              aria-label="Status"
              value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value })}
            >
              <option value="live">Live</option>
              <option value="draft">Draft</option>
              <option value="">Live or draft</option>
            </select>
          </label>
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Searching…" : "Search"}
          </Button>
        </form>
        {failure && (
          <p role="alert">
            {"Couldn't load this."}{" "}
            <button className="underline" onClick={() => search()}>
              Try again
            </button>
          </p>
        )}
        {rows && (
          <ul className="max-h-80 divide-y divide-dashed overflow-y-auto rounded-lg border">
            {rows.length === 0 && (
              <li className="text-muted-foreground p-3 text-sm">
                No questions match.
              </li>
            )}
            {rows.map((r) => {
              const here = inPaper.has(r.id);
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="accent-primary size-4"
                    aria-label={`Pick ${r.source} (${r.id})`}
                    disabled={here}
                    checked={chosen.includes(r.id)}
                    onChange={(e) =>
                      setChosen((x) =>
                        e.target.checked
                          ? [...x, r.id]
                          : x.filter((y) => y !== r.id),
                      )
                    }
                  />
                  <span className="font-medium">{r.source}</span>
                  <span className="text-muted-foreground">
                    {TYPE_LABELS[r.type as keyof typeof TYPE_LABELS]} ·{" "}
                    {plural(r.marks, "mark")} · {name(r.topic_id)}
                  </span>
                  {r.status !== "live" && (
                    <StatusPill pill={STATUS_PILL[r.status]} />
                  )}
                  {here ? (
                    <span className="text-muted-foreground text-xs">
                      In this paper
                    </span>
                  ) : (
                    r.papers.length > 0 && (
                      <span className="text-warning flex items-center gap-1 text-xs">
                        <Alert aria-hidden className="size-3 shrink-0" />
                        Already in: {r.papers.join(", ")}
                      </span>
                    )
                  )}
                  <span className="text-muted-foreground line-clamp-1 w-full text-xs">
                    {r.stem}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {rows && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {count} matches · Page {bankPage} of{" "}
              {Math.max(1, Math.ceil(count / 50))}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={pending || bankPage <= 1}
                onClick={() => search(bankPage - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={pending || bankPage * 50 >= count}
                onClick={() => search(bankPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending || !chosen.length}
            onClick={() =>
              onAdd((rows ?? []).filter((r) => chosen.includes(r.id)))
            }
          >
            Add {chosen.length || ""} to section
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
