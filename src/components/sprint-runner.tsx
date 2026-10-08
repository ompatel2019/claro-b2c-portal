"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { createClient } from "@/utils/supabase/client";
import { ensureSession, withAuthRetry } from "@/lib/auth-client";
import { answered, timer, type Attempt, type Session } from "@/lib/practice";
import { Button } from "./ui/button";
import { Logo } from "./logo";
import { RichText } from "./rich-text";
import { HomeworkStages } from "./homework-stages";
import { WrittenAnswer } from "./written-answer";
export function SprintRunner({
  session,
  initial,
  userId,
  homework,
}: {
  session: Session;
  initial: Attempt[];
  userId: string;
  homework?: { setId: string; title: string; cards: number; retries: number };
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
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const dirty = useRef(new Map<string, Partial<Attempt>>());
  function local(id: string, patch: Partial<Attempt>) {
    rows.current = rows.current.map((a) =>
      a.id === id ? { ...a, ...patch } : a,
    );
    setAttempts(rows.current);
  }
  function save(id: string, patch: Partial<Attempt>) {
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
    return operation;
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
    dirty.current.set(id, { ...dirty.current.get(id), ...patch });
  }
  useEffect(() => {
    // This clock is initialised inside the effect, after render.
    // eslint-disable-next-line react-hooks/purity
    let last = performance.now();
    const tick = setInterval(() => {
      const now = performance.now();
      seconds.current += Math.floor((now - last) / 1000);
      last += Math.floor((now - last) / 1000) * 1000;
      setElapsed(seconds.current);
    }, 1000);
    const persist = setInterval(() => {
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
    }, 15000);
    // Keep the access token fresh while the tab stays open.
    const refresh = setInterval(() => {
      void ensureSession(db).catch(() => {});
    }, 4 * 60_000);
    return () => {
      clearInterval(tick);
      clearInterval(persist);
      clearInterval(refresh);
    };
  }, [db, session.id, userId]);
  useEffect(() => {
    const timeout = setTimeout(() => {
      void flush().catch((e) => setError(e.message));
    }, 650);
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
    setIndex(next);
    try {
      await flush();
      await persistTime();
    } catch (e) {
      setError(
        e instanceof Error && e.message.includes("sign-in expired")
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not save your timer. Check your connection.",
      );
    }
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
    window.location.assign(`/practice/${session.id}/results`);
  }
  const a = attempts[index];
  const remaining = Math.max(0, session.config.time_limit_min * 60 - elapsed);
  const unanswered = attempts.filter((a) => !answered(a)).length;
  if (!a && !homework)
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1>No questions in this sprint</h1>
        <Button onClick={() => router.push("/")}>Return to dashboard</Button>
      </main>
    );
  if (finishing)
    return (
      <main className="mx-auto max-w-xl p-6">
        <div className="panel space-y-4 p-8" role="status">
          <Logo />
          <h1 className="text-3xl">Marking your answers</h1>
          <p>
            We’re checking your answers and preparing your feedback. This can
            take a little while.
          </p>
        </div>
      </main>
    );
  async function openReview() {
    await flush();
    await persistTime();
    const photo = rows.current.findIndex(
      (row) =>
        row.image_path && ["pending", "transcribed"].includes(row.status),
    );
    if (homework && photo >= 0) {
      setIndex(photo);
      throw new Error(
        `Check and confirm the photo transcript, then submit your answer for question ${photo + 1} before reviewing your homework.`,
      );
    }
    setReview(true);
  }
  if (homework && (review || !a))
    return (
      <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
        <HomeworkStages
          {...homework}
          stage={3}
          right={homework.cards}
          answered={attempts.filter(answered).length}
          questions={attempts.length}
          disabled={busy}
          onQuestions={() => setReview(false)}
          onReview={() => void act(openReview)}
        />
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await flush();
              await persistTime();
              router.push("/homework");
            })
          }
        >
          Save and exit
        </Button>
        <section className="panel space-y-5 p-6">
          <h2>Ready to submit?</h2>
          <p>
            Flashcards {homework.cards} of {homework.cards} right ·{" "}
            {homework.retries} retries
          </p>
          <ul className="space-y-3">
            {attempts.map((row, i) => (
              <li
                className="border-line flex flex-wrap justify-between gap-3 border-b pb-3"
                key={row.id}
              >
                <span>
                  Question {i + 1} ·{" "}
                  {row.question.type === "mcq"
                    ? "Multiple choice"
                    : "Short answer"}{" "}
                  · {row.question.marks} marks
                </span>
                <strong>{answered(row) ? "Answered" : "Not answered"}</strong>
              </li>
            ))}
          </ul>
          {unanswered > 0 && (
            <div className="bg-peach-soft space-y-3 rounded-2xl p-4">
              <p>
                {unanswered}{" "}
                {unanswered === 1
                  ? "question not answered"
                  : "questions not answered"}
                . Once submitted, your answers are final.
              </p>
              {attempts.map(
                (row, i) =>
                  !answered(row) && (
                    <Button
                      variant="outline"
                      key={row.id}
                      disabled={busy}
                      onClick={() => {
                        setIndex(i);
                        setReview(false);
                      }}
                    >
                      Answer question {i + 1}
                    </Button>
                  ),
              )}
            </div>
          )}
          {error && <p role="alert">{error}</p>}
          <Button disabled={busy} onClick={() => void act(finish)}>
            Submit homework
          </Button>
          {attempts.length > 0 && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setReview(false)}
            >
              Back to questions
            </Button>
          )}
        </section>
      </main>
    );
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-5 sm:px-8">
      {homework && (
        <HomeworkStages
          {...homework}
          stage={2}
          right={homework.cards}
          answered={attempts.filter(answered).length}
          questions={attempts.length}
          disabled={busy}
          onQuestions={() => setReview(false)}
          onReview={() => void act(openReview)}
        />
      )}
      <header className="panel flex flex-wrap items-center justify-between gap-4 p-4">
        <Logo />
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await flush();
              await persistTime();
              router.push(homework ? "/homework" : "/");
            })
          }
        >
          {homework ? "Save and exit" : "Exit"}
        </Button>
        <p>
          Question {index + 1} of {attempts.length} · {a.question.marks} marks
        </p>
        {!homework && (
          <p aria-label="Time remaining" className="font-mono text-lg">
            {timer(remaining)}
          </p>
        )}
      </header>
      {!homework && remaining === 0 && (
        <div role="status" className="panel bg-peach p-5">
          <strong>Time’s up</strong>
          <p>You can check your answers and submit when you’re ready.</p>
          <Button className="mt-3" onClick={() => setConfirm(true)}>
            Submit sprint
          </Button>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="panel border-destructive text-destructive sticky top-3 z-10 flex flex-wrap items-center justify-between gap-3 p-4"
        >
          <p>{error}</p>
          {error.includes("sign-in expired") && (
            <a
              className="button-link"
              href={`/sign-in?next=${homework ? `/homework/${homework.setId}/do` : `/practice/${session.id}`}`}
            >
              Sign in again
            </a>
          )}
        </div>
      )}
      <nav aria-label="Question navigator" className="panel p-4">
        <p className="mb-3 text-sm">
          Filled: answered · Orange border: flagged · Empty: not answered
        </p>
        <div className="flex flex-wrap gap-2">
          {attempts.map((row, i) => (
            <button
              key={row.id}
              disabled={busy}
              aria-current={index === i ? "step" : undefined}
              aria-label={`Question ${i + 1}: ${answered(row) ? "Answered" : "Not answered"}${row.flagged ? ", Flagged" : ""}`}
              onClick={() => void act(() => change(i))}
              className={`min-h-11 min-w-11 rounded-full border-2 px-3 ${row.flagged ? "border-brand" : "border-line"} ${answered(row) ? "bg-ink text-white" : "bg-white"} ${index === i ? "ring-ink ring-2 ring-offset-2" : ""}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </nav>
      <article className="panel space-y-5 p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="chip">
            {a.question.source} {a.question.year ?? ""} · {a.question.marks}{" "}
            marks
          </p>
          <Button
            variant="outline"
            aria-pressed={a.flagged}
            disabled={busy || !["pending", "transcribed"].includes(a.status)}
            onClick={() =>
              void act(async () => {
                const patch = { flagged: !a.flagged };
                await save(a.id, patch);
                local(a.id, patch);
              })
            }
          >
            {a.flagged ? "Unflag question" : "Flag question"}
          </Button>
        </div>
        <RichText
          className="text-2xl leading-snug font-bold tracking-tight sm:text-3xl"
          text={a.question.stem}
        />
        {a.question.stimulus && (
          <RichText
            className="bg-paper space-y-3 rounded-2xl p-5"
            text={a.question.stimulus}
          />
        )}
        {a.question.type === "mcq" ? (
          <fieldset className="space-y-3">
            <legend className="mb-3 font-semibold">Choose your answer</legend>
            {a.question.options?.map((option, i) => (
              <label
                key={i}
                className={`flex cursor-pointer items-start gap-4 rounded-2xl border p-4 ${a.choice_index === i ? "border-brand bg-peach-soft" : "border-line"}`}
              >
                <input
                  type="radio"
                  name={`choice-${a.id}`}
                  aria-label={`Option ${"ABCD"[i]}: ${option}`}
                  checked={a.choice_index === i}
                  disabled={busy}
                  onChange={() => {
                    const previous = a.choice_index;
                    local(a.id, { choice_index: i });
                    save(a.id, { choice_index: i }).catch((e: Error) => {
                      local(a.id, { choice_index: previous });
                      setError(e.message);
                    });
                  }}
                />
                <span>
                  <strong>{"ABCD"[i]}.</strong> {option}
                </span>
              </label>
            ))}
          </fieldset>
        ) : (
          <WrittenAnswer
            disabled={busy}
            onBusy={setBusy}
            key={a.id}
            attempt={a}
            userId={userId}
            edit={(patch) => edit(a.id, patch)}
            save={(patch) => save(a.id, patch)}
            flush={flush}
            local={(patch) => local(a.id, patch)}
          />
        )}
      </article>
      <div className="flex flex-wrap justify-between gap-3">
        <Button
          variant="outline"
          disabled={busy || index === 0}
          onClick={() => void act(() => change(index - 1))}
        >
          Previous question
        </Button>
        {index < attempts.length - 1 && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void act(() => change(index + 1))}
          >
            Next question
          </Button>
        )}
        {homework && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await change(Math.min(index + 1, attempts.length - 1));
              })
            }
          >
            Skip for now
          </Button>
        )}
        <Button
          disabled={busy}
          onClick={() => (homework ? void act(openReview) : setConfirm(true))}
        >
          {homework ? "Review and submit" : "Submit sprint"}
        </Button>
      </div>
      {busy && (
        <p role="status">
          {confirm ? "Saving your answers…" : "Saving or marking your answers…"}
        </p>
      )}
      <Dialog.Root open={confirm} onOpenChange={setConfirm}>
        <Dialog.Portal>
          <Dialog.Backdrop className="bg-ink/40 fixed inset-0" />
          <Dialog.Popup className="panel fixed top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-5 p-6">
            <Dialog.Title className="text-2xl font-semibold">
              Submit your sprint?
            </Dialog.Title>
            <Dialog.Description>
              {unanswered} questions not answered. Once submitted, your answers
              are final.
            </Dialog.Description>
            <div className="flex flex-wrap gap-3">
              <Dialog.Close render={<Button variant="outline" />}>
                Keep practising
              </Dialog.Close>
              <Button disabled={busy} onClick={() => void act(finish)}>
                Confirm submit
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
