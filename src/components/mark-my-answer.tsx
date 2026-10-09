"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  createCheck,
  finishCheck,
  restoreUnreadableCheck,
} from "@/app/(app)/student/mark/actions";
import { createClient } from "@/utils/supabase/client";
import { withAuthRetry } from "@/lib/auth-client";
import {
  answerValid,
  filterBankQuestions,
  detectVerb,
  NESA_VERBS,
  ownQuestionSchema,
  type BankQuestion,
  type OwnQuestion,
} from "@/lib/single-check";
import type { Attempt, Topic } from "@/lib/practice";
import { WrittenAnswer } from "./written-answer";
import { QuestionView } from "./question-view";
import {
  MARK_MY_ANSWER_DAILY_LIMIT,
  LONG_PHOTO_PAGE_LIMIT,
} from "@/lib/limits";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

function Choice({
  label,
  value,
  items,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <Select
        value={value}
        onValueChange={(v) => v !== null && onChange(v)}
        disabled={disabled}
        items={items}
      >
        <SelectTrigger aria-label={label} className="h-9 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
const emptyAnswer = {
  id: "draft",
  question_id: "",
  position: 1,
  choice_index: null,
  answer_text: null,
  transcript: null,
  image_paths: null,
  flagged: false,
  status: "pending",
  mark: null,
  max_marks: null,
  band: null,
  feedback: null,
} satisfies Omit<Attempt, "question">;
export function MarkMyAnswer({
  questions,
  topics,
  userId,
  left,
  initial,
}: {
  questions: BankQuestion[];
  topics: Topic[];
  userId: string;
  left: number;
  initial?: {
    sessionId: string;
    attempt: Omit<Attempt, "question">;
    question?: OwnQuestion;
    questionId?: string;
  };
}) {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [restored, setRestored] = useState(false);
  const draftKey = `claro.single.${userId}`;
  const [source, setSource] = useState(initial?.question ? "own" : "bank");
  const [selected, setSelected] = useState(initial?.questionId ?? "");
  const [search, setSearch] = useState("");
  const [bankOpen, setBankOpen] = useState(true);
  const [activeOption, setActiveOption] = useState(0);
  const bankListId = useId();
  const [type, setType] = useState("all");
  const [topic, setTopic] = useState("all");
  const [year, setYear] = useState("all");
  const [own, setOwn] = useState<OwnQuestion>(
    initial?.question ?? {
      stem: "",
      marks: 0,
      verb: "",
      topic_id: null,
      criteria_text: "",
    },
  );
  const [verbEdited, setVerbEdited] = useState(false);
  const [mode, setMode] = useState<"type" | "photo">(
    initial?.attempt.image_paths?.length ? "photo" : "type",
  );
  const [answer, setAnswer] = useState<Omit<Attempt, "question">>(
    initial?.attempt ?? emptyAnswer,
  );
  const answerRef = useRef(answer);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inputBusy, setInputBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [remaining, setRemaining] = useState(left);
  const created = useRef<{ sessionId: string; attemptId: string } | null>(
    initial
      ? { sessionId: initial.sessionId, attemptId: initial.attempt.id }
      : null,
  );
  const [submitted, setSubmitted] = useState(false);
  const creating = useRef<Promise<{
    sessionId: string;
    attemptId: string;
  }> | null>(null);
  const question =
    source === "bank"
      ? questions.find((q) => q.id === selected)
      : {
          id: "own",
          stem: own.stem,
          marks: own.marks || 1,
          type: own.marks > 8 ? ("extended" as const) : ("short" as const),
          topic_id: own.topic_id ?? "",
          stimulus: null,
          options: null,
          source: "Your question",
          year: null,
        };
  const validQuestion =
    source === "bank" ? !!question : ownQuestionSchema.safeParse(own).success;
  const valid =
    validQuestion &&
    answerValid(answer, confirmed) &&
    (mode !== "photo" || !!answer.image_paths?.length) &&
    (remaining > 0 || answer.id !== "draft");
  const locked = busy || inputBusy || offline || submitted;
  const questionLocked = locked || answer.id !== "draft";
  const results = filterBankQuestions(questions, topics, {
    type,
    topic,
    year,
    search,
  }).slice(0, 30);
  const optionIndex = Math.min(activeOption, Math.max(0, results.length - 1));
  const fieldError = (field: "stem" | "marks" | "criteria_text") => {
    if (!touched[field]) return null;
    const parsed = ownQuestionSchema.safeParse(own);
    const issue =
      !parsed.success && parsed.error.issues.find((i) => i.path[0] === field);
    return issue ? (
      <p
        id={`${field}-error`}
        role="alert"
        className="text-destructive text-sm"
      >
        {issue.message}
      </p>
    ) : null;
  };
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const draft = z
            .object({
              source: z.enum(["own", "bank"]),
              selected: z.string(),
              own: ownQuestionSchema.extend({
                stem: z.string().max(3000),
                marks: z.number().int().min(0).max(20),
              }),
              mode: z.enum(["type", "photo"]),
              answer: z.object({
                answer_text: z.string().nullable(),
                transcript: z.string().nullable(),
                image_paths: z.array(z.string()).nullable(),
              }),
              sessionId: z.string().nullable(),
            })
            .safeParse(JSON.parse(raw));
          if (draft.success && draft.data.sessionId && !initial) {
            const db = createClient();
            const { data: session, error: readError } = await db
              .from("sessions")
              .select("finished_at")
              .eq("id", draft.data.sessionId)
              .eq("user_id", userId)
              .maybeSingle();
            if (readError) {
              // Let the owned report route handle auth/network failures without overwriting the draft.
              router.replace(`/student/activity/${draft.data.sessionId}`);
              return;
            }
            if (session && !session.finished_at) {
              router.replace(`/student/activity/${draft.data.sessionId}`);
              return;
            }
            localStorage.removeItem(draftKey);
            setRestored(true);
            return;
          }
          if (
            draft.success &&
            (!initial || draft.data.sessionId === initial.sessionId)
          ) {
            // A saved session's question is immutable; only restore its answer.
            if (!initial) {
              setSource(draft.data.source);
              setSelected(draft.data.selected);
              setOwn(draft.data.own);
              setVerbEdited(true);
            }
            setMode(draft.data.mode);
            setAnswer((previous) => {
              const next = { ...previous, ...draft.data.answer };
              answerRef.current = next;
              return next;
            });
          }
        }
      } catch {
        /* Browser storage can be unavailable. */
      }
      setRestored(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [draftKey, initial, router, userId]);
  useEffect(() => {
    if (!restored || submitted) return;
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          source,
          selected,
          own,
          mode,
          answer: {
            answer_text: answer.answer_text,
            transcript: answer.transcript,
            image_paths: answer.image_paths,
          },
          sessionId: created.current?.sessionId ?? null,
        }),
      );
    } catch {
      /* Keep the in-memory draft if storage is full. */
    }
  }, [restored, submitted, draftKey, source, selected, own, mode, answer]);
  function patch(p: Partial<Attempt>) {
    answerRef.current = { ...answerRef.current, ...p };
    setAnswer(answerRef.current);
  }
  async function ensureCreated() {
    if (created.current) return created.current;
    if (!validQuestion)
      throw new Error("Complete your question before uploading an answer.");
    creating.current ??= createCheck(
      source === "bank"
        ? { source, question_id: selected }
        : { source, question: own },
    ).then((result) => {
      if ("error" in result) throw new Error(result.error);
      return result;
    });
    try {
      const result = await creating.current;
      created.current = result;
      patch({ id: result.attemptId });
      setRemaining((n) => Math.max(0, n - 1));
      return result;
    } finally {
      creating.current = null;
    }
  }
  async function save(p: Partial<Attempt>) {
    const { attemptId } = await ensureCreated();
    if (answerRef.current.status === "unreadable") {
      const result = await restoreUnreadableCheck(attemptId);
      if (result.error) throw new Error(result.error);
      patch({ status: "transcribed" });
    }
    const db = createClient();
    await withAuthRetry(db, async () => {
      const content = { ...answerRef.current, ...p };
      const { error, data } = await db
        .from("attempts")
        .update({
          answer_text: content.answer_text,
          transcript: content.transcript,
          image_paths: content.image_paths,
        })
        .eq("id", attemptId)
        .eq("user_id", userId)
        .in("status", ["pending", "transcribed"])
        .select("id");
      if (error || !data?.length)
        throw new Error(
          error?.message ??
            "This answer is no longer editable. View your check in Recent checks.",
        );
    });
  }
  async function changeMode(next: "type" | "photo") {
    if (next === "type" && answer.image_paths?.length) {
      setInputBusy(true);
      try {
        const content = {
          answer_text: answer.transcript ?? "",
          transcript: null,
          image_paths: null,
        };
        await save(content);
        patch(content);
        setConfirmed(false);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save your answer.");
        return;
      } finally {
        setInputBusy(false);
      }
    }
    setMode(next);
  }
  async function submit() {
    if (!valid || locked || creating.current) return;
    setBusy(true);
    setError("");
    try {
      const { sessionId, attemptId } = await ensureCreated();
      if (!submitted) {
        await save({});
        const result = await finishCheck(sessionId);
        if (result.error) throw new Error(result.error);
        setSubmitted(true);
      }
      // The request continues on the server while the report shows its live state.
      void fetch(`/api/attempts/${attemptId}/mark`, {
        method: "POST",
        keepalive: true,
      })
        .then(() => router.refresh())
        .catch(() => router.refresh());
      try {
        localStorage.removeItem(draftKey);
      } catch {}
      router.push(`/student/activity/${sessionId}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "We couldn't mark this one. Retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {offline && (
        <p
          role="status"
          className="bg-warning-soft mb-4 rounded-lg p-3 text-sm"
        >
          {"You're offline. We'll save when you're back."}
        </p>
      )}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Question</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <ToggleGroup
              value={[source]}
              onValueChange={(v) => {
                if (v[0]) setSource(v[0]);
              }}
              aria-label="Question source"
              className="w-full flex-wrap"
              disabled={questionLocked}
            >
              <ToggleGroupItem value="bank">
                From the Claro bank
              </ToggleGroupItem>
              <ToggleGroupItem value="own">My own question</ToggleGroupItem>
            </ToggleGroup>
            {source === "bank" ? (
              <>
                <label className="grid gap-1.5 text-sm font-medium">
                  Search questions
                  <Input
                    value={search}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={bankOpen && !questionLocked}
                    aria-controls={bankListId}
                    aria-activedescendant={
                      bankOpen && results[optionIndex]
                        ? `${bankListId}-${results[optionIndex].id}`
                        : undefined
                    }
                    onFocus={() => setBankOpen(true)}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setActiveOption(0);
                      setBankOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                        e.preventDefault();
                        setBankOpen(true);
                        setActiveOption((i) =>
                          Math.max(
                            0,
                            Math.min(
                              results.length - 1,
                              i + (e.key === "ArrowDown" ? 1 : -1),
                            ),
                          ),
                        );
                      } else if (
                        e.key === "Enter" &&
                        bankOpen &&
                        !e.metaKey &&
                        !e.ctrlKey
                      ) {
                        e.preventDefault();
                        if (results[optionIndex]) {
                          setSelected(results[optionIndex].id);
                          setBankOpen(false);
                        }
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setBankOpen(false);
                      }
                    }}
                    placeholder="Question text or 2023 HSC Q22"
                    disabled={questionLocked}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Choice
                    label="Type"
                    value={type}
                    onChange={setType}
                    disabled={questionLocked}
                    items={[
                      { value: "all", label: "All written questions" },
                      { value: "short", label: "Short" },
                      { value: "extended", label: "Extended" },
                    ]}
                  />
                  <Choice
                    label="Topic"
                    value={topic}
                    onChange={setTopic}
                    disabled={questionLocked}
                    items={[
                      { value: "all", label: "All topics" },
                      ...topics.map((t) => ({ value: t.id, label: t.name })),
                    ]}
                  />
                  <Choice
                    label="Year"
                    value={year}
                    onChange={setYear}
                    disabled={questionLocked}
                    items={[
                      { value: "all", label: "All years" },
                      ...[
                        ...new Set(
                          questions.flatMap((q) => (q.year ? [q.year] : [])),
                        ),
                      ]
                        .sort((a, b) => b - a)
                        .map((y) => ({ value: String(y), label: String(y) })),
                    ]}
                  />
                </div>
                {!questionLocked && (
                  <div
                    className="max-h-[min(16rem,40svh)] overflow-y-auto rounded-xl border"
                    hidden={!bankOpen}
                  >
                    <p
                      role="status"
                      className="text-muted-foreground px-3 py-2 text-xs"
                    >
                      {results.length
                        ? `${results.length} matching questions${results.length === 30 ? " · refine your search for more" : ""}`
                        : "No questions match. Try another search or use your own question."}
                    </p>
                    <ul
                      id={bankListId}
                      role="listbox"
                      aria-label="Matching questions"
                    >
                      {results.map((q) => (
                        <li key={q.id}>
                          <button
                            type="button"
                            id={`${bankListId}-${q.id}`}
                            role="option"
                            aria-selected={selected === q.id}
                            onClick={() => {
                              setSelected(q.id);
                              setBankOpen(false);
                            }}
                            className={`hover:bg-muted w-full border-t p-3 text-left focus-visible:outline-2 ${selected === q.id ? "bg-muted" : ""}`}
                          >
                            <span className="line-clamp-2 block text-sm font-medium">
                              {q.stem}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {q.source} · {q.marks} marks
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {question && (
                  <div className="bg-muted/40 space-y-3 rounded-xl border p-4">
                    <p className="text-muted-foreground text-xs">
                      Selected question · {question.marks} marks
                    </p>
                    <QuestionView question={question} />
                  </div>
                )}
              </>
            ) : (
              <>
                <label className="grid gap-1.5 text-sm font-medium">
                  Question text
                  <Textarea
                    rows={5}
                    maxLength={3000}
                    value={own.stem}
                    disabled={questionLocked}
                    required
                    aria-invalid={!!fieldError("stem")}
                    aria-describedby="stem-help stem-error"
                    onBlur={() => setTouched((t) => ({ ...t, stem: true }))}
                    onChange={(e) =>
                      setOwn({
                        ...own,
                        stem: e.target.value,
                        ...(!verbEdited
                          ? { verb: detectVerb(e.target.value) }
                          : {}),
                      })
                    }
                  />
                  <span
                    id="stem-help"
                    className="text-muted-foreground text-xs"
                  >
                    10–3,000 characters. Paste the stimulus too.
                  </span>
                </label>
                {fieldError("stem")}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Choice
                    label="Marks"
                    value={String(own.marks)}
                    onChange={(v) => {
                      setOwn({ ...own, marks: Number(v) });
                      setTouched((t) => ({ ...t, marks: true }));
                    }}
                    disabled={questionLocked}
                    items={[
                      { value: "0", label: "Choose marks" },
                      ...Array.from({ length: 20 }, (_, i) => ({
                        value: String(i + 1),
                        label: `${i + 1} ${i === 0 ? "mark" : "marks"}`,
                      })),
                    ]}
                  />
                  <Choice
                    label="Directive verb"
                    value={own.verb}
                    onChange={(v) => {
                      setVerbEdited(true);
                      setOwn({ ...own, verb: v });
                    }}
                    disabled={questionLocked}
                    items={[
                      { value: "", label: "Not sure" },
                      ...NESA_VERBS.map((v) => ({
                        value: v,
                        label: v[0].toUpperCase() + v.slice(1),
                      })),
                    ]}
                  />
                </div>
                {fieldError("marks")}
                <Choice
                  label="Topic (optional)"
                  value={own.topic_id ?? ""}
                  onChange={(v) => setOwn({ ...own, topic_id: v || null })}
                  disabled={questionLocked}
                  items={[
                    { value: "", label: "No topic selected" },
                    ...topics
                      .filter((t) => t.parent_id)
                      .map((t) => ({ value: t.id, label: t.name })),
                  ]}
                />
                <label className="grid gap-1.5 text-sm font-medium">
                  Marking guidelines (optional)
                  <Textarea
                    rows={3}
                    maxLength={3000}
                    placeholder="Paste them if you have them"
                    value={own.criteria_text ?? ""}
                    disabled={questionLocked}
                    onBlur={() =>
                      setTouched((t) => ({ ...t, criteria_text: true }))
                    }
                    onChange={(e) =>
                      setOwn({ ...own, criteria_text: e.target.value })
                    }
                  />
                </label>
                {fieldError("criteria_text")}
                <p className="text-muted-foreground text-sm">
                  Without guidelines we mark against the verb and the marks
                  available, so treat the mark as an estimate.
                </p>
              </>
            )}
            {answer.id !== "draft" && (
              <p className="text-muted-foreground text-xs">
                Question saved for this check. Your answer stays editable until
                you submit.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your answer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ToggleGroup
              value={[mode]}
              onValueChange={(v) => {
                if (v[0]) void changeMode(v[0] as "type" | "photo");
              }}
              aria-label="Answer format"
              disabled={locked}
            >
              <ToggleGroupItem value="type">Type</ToggleGroupItem>
              <ToggleGroupItem value="photo">Photo</ToggleGroupItem>
            </ToggleGroup>
            {mode === "photo" && (
              <p className="text-muted-foreground text-sm">
                Upload up to {LONG_PHOTO_PAGE_LIMIT} pages, then read and
                confirm your transcript. Each photo must be 10 MB or less.
              </p>
            )}
            <WrittenAnswer
              attempt={{
                ...answer,
                question: question ?? {
                  id: "",
                  type: "short",
                  topic_id: "",
                  marks: 1,
                  stem: "",
                  stimulus: null,
                  options: null,
                  source: "",
                  year: null,
                },
              }}
              userId={userId}
              edit={patch}
              local={patch}
              save={save}
              flush={async () => {
                await save({});
              }}
              paper
              mode={mode}
              disabled={
                busy ||
                submitted ||
                offline ||
                (mode === "photo" &&
                  (!validQuestion ||
                    (remaining === 0 && answer.id === "draft")))
              }
              onBusy={setInputBusy}
              onConfirmed={setConfirmed}
              onModeChange={setMode}
              onError={setError}
            />
          </CardContent>
        </Card>
        <Card className="z-10 flex flex-row flex-wrap items-center justify-between gap-3 p-4 sm:sticky sm:bottom-3">
          <p className="text-sm tabular-nums" role="status">
            {remaining} of {MARK_MY_ANSWER_DAILY_LIMIT} checks left today
          </p>
          <Button type="submit" disabled={!valid || locked}>
            {busy ? "Marking…" : error ? "Retry" : "Mark my answer"}
          </Button>
          {remaining === 0 && answer.id === "draft" && (
            <p role="alert" className="w-full text-sm">
              {"You've used today's 20 checks. More at midnight."}
            </p>
          )}
          {error && (
            <p role="alert" className="text-destructive w-full text-sm">
              {error}
            </p>
          )}
        </Card>
      </form>
      <Dialog
        open={/session expired|sign-in expired|unauthorised/i.test(error)}
        onOpenChange={(open) => {
          if (!open) setError("");
        }}
      >
        <DialogContent>
          <DialogTitle>Sign in to keep working</DialogTitle>
          <DialogDescription>
            Your draft is kept in this browser. Sign in, then return to finish
            your check.
          </DialogDescription>
          <a
            href={`/sign-in?next=${encodeURIComponent(initial ? `/student/activity/${initial.sessionId}` : "/student/mark")}`}
            className="text-sm font-semibold underline"
          >
            Sign in again
          </a>
        </DialogContent>
      </Dialog>
    </>
  );
}
