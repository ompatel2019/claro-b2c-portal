"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, Spinner } from "@/components/icons";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { ensureSession, withAuthRetry } from "@/lib/auth-client";
import {
  answered,
  plural,
  timeLimit,
  timer,
  type Attempt,
  type Session,
} from "@/lib/practice";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Logo } from "./logo";
import { RichText } from "./rich-text";
import { isTyping, SessionShell, type SaveState } from "./session-shell";
import { WrittenAnswer } from "./written-answer";

const LETTERS = "ABCD";
const TYPE_LABEL = {
  mcq: "Multiple choice",
  short: "Short answer",
  extended: "Extended response",
};
const draftKey = (id: string) => `claro-draft-${id}`;
/** Booklet chip colour once a question is checked: full, part or no marks. */
const markTone = (row: Attempt) =>
  Number(row.mark) >= Number(row.max_marks)
    ? "bg-success border-success text-white"
    : Number(row.mark) > 0
      ? "bg-warning border-warning text-white"
      : "bg-destructive border-destructive text-white";

export function SprintRunner({
  session,
  initial,
  userId,
  title,
  topicNames = {},
  seen = [],
}: {
  session: Session;
  initial: Attempt[];
  userId: string;
  title: string;
  topicNames?: Record<string, string>;
  seen?: string[];
}) {
  const router = useRouter();
  const [db] = useState(createClient);
  const [attempts, setAttempts] = useState(initial);
  const rows = useRef(initial);
  const first = initial.findIndex((a) => !answered(a));
  const [index, setIndex] = useState(first < 0 ? 0 : first);
  const [elapsed, setElapsed] = useState(session.elapsed_s ?? 0);
  const seconds = useRef(session.elapsed_s ?? 0);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [readAll, setReadAll] = useState(false);
  const [filter, setFilter] = useState<"all" | "unanswered" | "flagged">("all");
  const [finishing, setFinishing] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const dirty = useRef(new Map<string, Partial<Attempt>>());
  const limit = timeLimit(session.config);
  // §3.2 feedback "each": check as you go.
  const checkMode = session.config.feedback === "each";
  const [checking, setChecking] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});

  function local(id: string, patch: Partial<Attempt>) {
    rows.current = rows.current.map((a) =>
      a.id === id ? { ...a, ...patch } : a,
    );
    setAttempts(rows.current);
  }
  function save(id: string, patch: Partial<Attempt>) {
    setSaveState("saving");
    const operation = queue.current.then(() =>
      withAuthRetry(db, async () => {
        const { error, data } = await db
          .from("attempts")
          .update(patch)
          .eq("id", id)
          .eq("user_id", userId)
          .in("status", ["pending", "transcribed"])
          .select("id");
        if (error || !data?.length)
          throw new Error(
            error?.message ??
              "This answer is no longer editable. Refresh to see its status.",
          );
      }),
    );
    queue.current = operation.catch(() => {});
    return operation.then(
      () => {
        if (!dirty.current.has(id)) localStorage.removeItem(draftKey(id));
        if (!dirty.current.size) setSaveState("saved");
      },
      (e) => {
        setSaveState("error");
        throw e;
      },
    );
  }
  async function flush() {
    for (const [id, patch] of dirty.current) {
      dirty.current.delete(id);
      try {
        await save(id, patch);
      } catch (error) {
        dirty.current.set(id, { ...patch, ...dirty.current.get(id) });
        throw error;
      }
    }
    await queue.current;
  }
  async function persistTime() {
    await withAuthRetry(db, async () => {
      const { error } = await db
        .from("sessions")
        .update({ elapsed_s: seconds.current })
        .eq("id", session.id)
        .eq("user_id", userId)
        .is("finished_at", null);
      if (error) throw new Error(error.message);
    });
  }
  function edit(id: string, patch: Partial<Attempt>) {
    local(id, patch);
    const next = { ...dirty.current.get(id), ...patch };
    dirty.current.set(id, next);
    // Mirror unsaved text locally until the server confirms it.
    localStorage.setItem(draftKey(id), JSON.stringify(next));
    setSaveState("saving");
  }
  useEffect(() => {
    // Restore drafts the server never confirmed (closed tab, lost connection).
    for (const a of rows.current) {
      const draft = localStorage.getItem(draftKey(a.id));
      if (!draft) continue;
      if (["pending", "transcribed"].includes(a.status))
        edit(a.id, JSON.parse(draft));
      else localStorage.removeItem(draftKey(a.id));
    }
    if (initial.some(answered))
      toast(
        limit
          ? `Welcome back. ${timer(Math.max(0, limit - (session.elapsed_s ?? 0)))} left`
          : "Welcome back.",
      );
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // This clock is initialised inside the effect, after render.
    let last = performance.now();
    const tick = setInterval(() => {
      const now = performance.now();
      seconds.current += Math.floor((now - last) / 1000);
      last += Math.floor((now - last) / 1000) * 1000;
      setElapsed(seconds.current);
    }, 1000);
    const save = () =>
      void withAuthRetry(db, async () => {
        const { error } = await db
          .from("sessions")
          .update({ elapsed_s: seconds.current })
          .eq("id", session.id)
          .eq("user_id", userId)
          .is("finished_at", null);
        if (error) throw new Error(error.message);
      }).catch((e: Error) =>
        setError(
          e.message.includes("sign-in expired")
            ? e.message
            : "Could not save your timer. Check your connection.",
        ),
      );
    const persist = setInterval(save, 15000);
    const hide = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", hide);
    // Keep the access token fresh while the tab stays open.
    const refresh = setInterval(
      () => void ensureSession(db).catch(() => {}),
      4 * 60_000,
    );
    return () => {
      clearInterval(tick);
      clearInterval(persist);
      clearInterval(refresh);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [db, session.id, userId]);
  useEffect(() => {
    // Debounced autosave; after a failure, retry every 5 s.
    const timeout = setTimeout(
      () => void flush().catch((e) => setError(e.message)),
      saveState === "error" ? 5000 : 650,
    );
    return () => clearTimeout(timeout);
  });
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setFinishing(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function change(next: number) {
    if (next < 0 || next >= rows.current.length) return;
    // Persist the current draft before swapping questions so keystrokes
    // during the transition cannot land on the next question.
    await flush();
    await persistTime();
    setIndex(next);
  }
  async function finish() {
    setConfirm(false);
    setFinishing(true);
    setError("");
    await ensureSession(db);
    await flush();
    await persistTime();
    async function post() {
      const response = await fetch(`/api/sessions/${session.id}/finish`, {
        method: "POST",
        credentials: "same-origin",
      });
      const result = await response.json().catch(() => ({}));
      return { response, result };
    }
    let { response, result } = await post();
    if (response.status === 401) {
      await ensureSession(db);
      ({ response, result } = await post());
    }
    if (!response.ok)
      throw new Error(
        result.error ?? "Could not finish your session. Please try again.",
      );
    // Hard navigation so no cached "unfinished" redirect can bounce us back.
    window.location.assign(`/student/sprint/${session.id}/results`);
  }
  const a = attempts[index];
  const editable = !!a && ["pending", "transcribed"].includes(a.status);
  const answerKey =
    checkMode && a?.status === "marked" ? a.feedback?.correct_index : null;
  async function check() {
    const id = a.id;
    setChecking(id);
    setError("");
    try {
      await flush();
      const post = () =>
        fetch(`/api/attempts/${id}/mark`, {
          method: "POST",
          credentials: "same-origin",
        });
      let res = await post();
      if (res.status === 401) {
        await ensureSession(db);
        res = await post();
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          body.error ?? "Could not check this answer. Try again.",
        );
      local(id, {
        status: body.status ?? "marked",
        mark: body.mark,
        max_marks: body.max_marks,
        band: body.band,
        feedback: body.feedback,
      });
      if (body.explanation)
        setExplanations((e) => ({ ...e, [id]: body.explanation }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(null);
    }
  }
  const checkRef = useRef(check);
  useEffect(() => {
    checkRef.current = check;
  });
  useEffect(() => {
    if (!checkMode) return;
    // ⌘Enter checks the current answer, even from the answer box.
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void checkRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [checkMode]);
  // §3.2 "Finish and mark automatically" when time runs out.
  const timedOut = useRef(false);
  useEffect(() => {
    if (
      !limit ||
      session.config.on_timeout !== "finish" ||
      elapsed < limit ||
      timedOut.current
    )
      return;
    timedOut.current = true;
    toast("Time’s up. Marking your answers.");
    void act(finish);
  });
  function choose(i: number | null) {
    const previous = a.choice_index;
    local(a.id, { choice_index: i });
    save(a.id, { choice_index: i }).catch((e: Error) => {
      local(a.id, { choice_index: previous });
      setError(e.message);
    });
  }
  function flag() {
    const previous = a.flagged;
    local(a.id, { flagged: !previous });
    save(a.id, { flagged: !previous }).catch((e: Error) => {
      local(a.id, { flagged: previous });
      setError(e.message);
    });
  }
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e) => {
      if (!a || busy || !editable) return;
      const k = e.key.toUpperCase();
      if (k === "F") flag();
      else if (a.question.type === "mcq" && /^[1-4A-D]$/.test(k)) {
        const i = /\d/.test(k) ? Number(k) - 1 : LETTERS.indexOf(k);
        if (i < (a.question.options?.length ?? 0)) choose(i);
      } else return;
      e.preventDefault();
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) =>
      !(e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) &&
      keys.current(e);
    // Capture phase, so an MC letter (B, C) picks the option before the
    // shell treats it as Booklet or Calculator.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const unanswered = attempts.flatMap((r, i) => (answered(r) ? [] : [i]));
  const flagged = attempts.flatMap((r, i) => (r.flagged ? [i] : []));
  if (!a)
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-6">
        <h1>No questions in this sprint</h1>
        <Button onClick={() => router.push("/")}>Return to dashboard</Button>
      </main>
    );
  if (finishing)
    return (
      <main className="mx-auto max-w-xl p-4 sm:p-6">
        <div className="bg-card space-y-3 rounded-xl border p-5" role="status">
          <Logo />
          <h1>Marking your answers</h1>
          <p>
            We’re checking your answers and preparing your feedback. This can
            take a little while.
          </p>
        </div>
      </main>
    );
  const go = (i: number) => void act(() => change(i));
  const qLabel = (i: number) => `Q${i + 1}`;
  const booklet = (
    <div className="space-y-3">
      <ToggleGroup
        aria-label="Show questions"
        size="sm"
        variant="outline"
        value={[filter]}
        onValueChange={(v) => v[0] && setFilter(v[0] as typeof filter)}
      >
        <ToggleGroupItem value="all">All</ToggleGroupItem>
        <ToggleGroupItem value="unanswered">Unanswered</ToggleGroupItem>
        <ToggleGroupItem value="flagged">Flagged</ToggleGroupItem>
      </ToggleGroup>
      <nav aria-label="Question booklet" className="space-y-3">
        {(["mcq", "short", "extended"] as const).map((type) => {
          const items = attempts
            .map((row, i) => ({ row, i }))
            .filter(({ row }) => row.question.type === type)
            .filter(({ row }) =>
              filter === "unanswered"
                ? !answered(row)
                : filter === "flagged"
                  ? row.flagged
                  : true,
            );
          return items.length ? (
            <div key={type}>
              <h3 className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-[0.04em] uppercase">
                {TYPE_LABEL[type]}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {items.map(({ row, i }) => (
                  <button
                    key={row.id}
                    data-q
                    disabled={busy}
                    aria-current={index === i ? "step" : undefined}
                    aria-label={`Question ${i + 1}: ${answered(row) ? "Answered" : "Not answered"}${row.flagged ? ", Flagged" : ""}${row.status === "marked" ? `, ${row.mark}/${row.max_marks} marks` : ""}`}
                    onClick={() => go(i)}
                    className={cn(
                      "relative size-9 rounded-full border text-sm font-medium tabular-nums",
                      answered(row)
                        ? "bg-ink border-ink text-white"
                        : "bg-white",
                      index === i && "ring-primary ring-2 ring-offset-2",
                      row.status === "marked" && markTone(row),
                    )}
                  >
                    {i + 1}
                    {row.flagged && (
                      <Flag
                        aria-hidden
                        className="text-primary fill-primary absolute -top-1 -right-1 size-3.5"
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : null;
        })}
      </nav>
      <ul className="text-muted-foreground space-y-1 text-xs">
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-full border bg-white" /> Not answered
        </li>
        <li className="flex items-center gap-2">
          <span className="bg-ink size-3 rounded-full" /> Answered
        </li>
        <li className="flex items-center gap-2">
          <Flag aria-hidden className="text-primary fill-primary size-3" />{" "}
          Flagged
        </li>
        <li className="flex items-center gap-2">
          <span className="ring-primary size-3 rounded-full ring-2" /> Current
        </li>
      </ul>
      <Button variant="outline" size="sm" onClick={() => setReadAll(true)}>
        Read all questions
      </Button>
    </div>
  );

  return (
    <SessionShell
      title={title}
      position={index + 1}
      total={attempts.length}
      answered={attempts.length - unanswered.length}
      saveState={saveState}
      onRetry={() => void flush().catch((e) => setError(e.message))}
      clock={
        limit
          ? { mode: "down", seconds: limit - elapsed }
          : { mode: "up", seconds: elapsed }
      }
      busy={busy}
      onExit={() =>
        void act(async () => {
          await flush();
          await persistTime();
          router.push("/");
        })
      }
      onFinish={() => setConfirm(true)}
      onMove={(d) => !busy && go(index + d)}
      booklet={booklet}
    >
      {error && (
        <div
          role="alert"
          className="border-destructive bg-destructive-soft text-destructive flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
        >
          <p>{error}</p>
          {error.includes("sign-in expired") && (
            <a
              className="button-link"
              href={`/sign-in?next=/student/sprint/${session.id}`}
            >
              Sign in again
            </a>
          )}
        </div>
      )}
      <article className="bg-card space-y-4 rounded-xl border p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-[13px] font-medium">
            {[
              `Question ${index + 1}`,
              TYPE_LABEL[a.question.type],
              plural(a.question.marks, "mark"),
              a.question.source,
              topicNames[a.question.topic_id],
            ]
              .filter(Boolean)
              .join(" · ")}
            {seen.includes(a.question_id) && (
              <Badge variant="outline" className="ml-2 align-middle">
                Seen before
              </Badge>
            )}
          </p>
          <Button
            variant="outline"
            size="sm"
            aria-pressed={a.flagged}
            disabled={busy || !editable}
            onClick={flag}
          >
            <Flag className={cn(a.flagged && "fill-primary text-primary")} />
            Flag for review
          </Button>
        </div>
        <RichText
          className="text-base leading-6 font-medium"
          text={a.question.stem}
        />
        {a.question.stimulus && (
          <RichText
            className="bg-paper space-y-3 rounded-xl p-4"
            text={a.question.stimulus}
          />
        )}
        {a.question.type === "mcq" ? (
          <fieldset className="space-y-2">
            <legend className="mb-2 font-semibold">Choose your answer</legend>
            {a.question.options?.map((option, i) => (
              <label
                key={i}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                  a.choice_index === i
                    ? "border-primary bg-accent"
                    : "hover:bg-muted",
                  answerKey === i && "border-success bg-success-soft",
                  answerKey != null &&
                    answerKey !== i &&
                    a.choice_index === i &&
                    "border-destructive bg-destructive-soft",
                )}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name={`choice-${a.id}`}
                  aria-label={`Option ${LETTERS[i]}: ${option}`}
                  checked={a.choice_index === i}
                  disabled={busy || !editable}
                  onChange={() => choose(i)}
                  onClick={() => a.choice_index === i && choose(null)}
                />
                <span
                  aria-hidden
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    a.choice_index === i &&
                      "bg-primary border-primary text-white",
                  )}
                >
                  {LETTERS[i]}
                </span>
                <span>{option}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <WrittenAnswer
            disabled={busy}
            onBusy={setBusy}
            key={a.question_id ?? a.id}
            attempt={a}
            userId={userId}
            edit={(patch) => edit(a.id, patch)}
            save={(patch) => save(a.id, patch)}
            flush={flush}
            local={(patch) => local(a.id, patch)}
          />
        )}
        {checkMode && (
          <CheckResult
            attempt={a}
            explanation={explanations[a.id]}
            checking={checking === a.id}
            canCheck={editable && answered(a) && !busy}
            onCheck={() => void check()}
          />
        )}
      </article>
      <div className="flex flex-wrap justify-between gap-3">
        <Button
          variant="outline"
          disabled={busy || index === 0}
          onClick={() => go(index - 1)}
        >
          Previous question
        </Button>
        {index < attempts.length - 1 ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => go(index + 1)}
          >
            Next question
          </Button>
        ) : (
          <Button disabled={busy} onClick={() => setConfirm(true)}>
            Finish
          </Button>
        )}
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogTitle>Finish and mark?</DialogTitle>
          <DialogDescription>
            {attempts.length - unanswered.length} of {attempts.length} answered.
            Unanswered questions score 0.
          </DialogDescription>
          {[
            ["Unanswered", unanswered],
            ["Flagged", flagged],
          ].map(([label, list]) =>
            (list as number[]).length ? (
              <p key={label as string} className="text-sm">
                {label as string}:{" "}
                {(list as number[]).map((i, n) => (
                  <span key={i}>
                    {n > 0 && ", "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        setConfirm(false);
                        go(i);
                      }}
                    >
                      {qLabel(i)}
                    </button>
                  </span>
                ))}
              </p>
            ) : null,
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Keep working
            </Button>
            <Button disabled={busy} onClick={() => void act(finish)}>
              Finish and mark
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={readAll} onOpenChange={setReadAll}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle>All questions</DialogTitle>
          <ol className="space-y-4">
            {attempts.map((row, i) => (
              <li
                key={row.id}
                className="space-y-1 border-b border-dashed pb-4"
              >
                <button
                  type="button"
                  className="text-sm font-semibold underline-offset-4 hover:underline"
                  onClick={() => {
                    setReadAll(false);
                    go(i);
                  }}
                >
                  Question {i + 1} · {row.question.marks}{" "}
                  {row.question.marks === 1 ? "mark" : "marks"}
                </button>
                <RichText className="text-sm" text={row.question.stem} />
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </SessionShell>
  );
}

function CheckResult({
  attempt: a,
  explanation,
  checking,
  canCheck,
  onCheck,
}: {
  attempt: Attempt;
  explanation?: string;
  checking: boolean;
  canCheck: boolean;
  onCheck: () => void;
}) {
  if (a.status === "marked") {
    if (a.question.type === "mcq") {
      const right = Number(a.mark) >= 1;
      const k = a.feedback?.correct_index;
      return (
        <div
          role="status"
          className={cn(
            "space-y-2 rounded-xl p-4 text-sm",
            right ? "bg-success-soft" : "bg-destructive-soft",
          )}
        >
          <p className="font-semibold">
            {right
              ? "Correct"
              : `Incorrect · Answer: ${k == null ? "unknown" : LETTERS[k]}`}
          </p>
          {explanation && <RichText text={explanation} />}
        </div>
      );
    }
    const next = a.feedback?.comments?.find(
      (c) => c.kind === "fix" && c.next_mark,
    )?.next_mark;
    return (
      <div role="status" className="bg-muted space-y-1 rounded-xl p-4 text-sm">
        <p className="font-semibold tabular-nums">
          {a.mark} / {a.max_marks}
        </p>
        {a.band && <p className="text-muted-foreground">Band: {a.band}</p>}
        {next && <p>Next mark: {next}</p>}
        <p className="text-muted-foreground text-xs">
          Full feedback in your results.
        </p>
      </div>
    );
  }
  if (checking || a.status === "marking")
    return (
      <p role="status" className="flex items-center gap-2 text-sm">
        <Spinner className="size-4 animate-spin" /> Marking…
      </p>
    );
  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" disabled={!canCheck} onClick={onCheck}>
        Check answer
      </Button>
      <span className="text-muted-foreground text-xs">⌘Enter</span>
    </div>
  );
}
