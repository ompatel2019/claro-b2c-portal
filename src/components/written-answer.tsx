"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown } from "@/components/icons";
import { createClient } from "@/utils/supabase/client";
import { ensureSession, withAuthRetry } from "@/lib/auth-client";
import { plural, type Attempt } from "@/lib/practice";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "./ui/alert-dialog";
import { Textarea } from "./ui/textarea";

import {
  WRITTEN_WORD_LIMIT as MAX_WORDS,
  WRITTEN_WORD_WARNING,
  ANSWER_PHOTO_BYTE_LIMIT,
  LONG_PHOTO_PAGE_LIMIT,
  SHORT_PHOTO_PAGE_LIMIT,
} from "@/lib/limits";
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
export function WrittenAnswer({
  attempt: a,
  userId,
  edit,
  save,
  flush,
  local,
  disabled,
  onBusy,
  paper = false,
  mode,
  onConfirmed,
  onModeChange,
  onError,
}: {
  disabled: boolean;
  paper?: boolean;
  mode?: "type" | "photo";
  onError?: (message: string) => void;
  onModeChange?: (mode: "type" | "photo") => void;
  onConfirmed?: (confirmed: boolean) => void;
  onBusy: (busy: boolean) => void;
  attempt: Attempt;
  userId: string;
  edit: (patch: Partial<Attempt>) => void;
  save: (patch: Partial<Attempt>) => Promise<void>;
  flush: () => Promise<void>;
  local: (patch: Partial<Attempt>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    a.status === "unreadable" ? "We couldn't read this photo." : "",
  );
  const [confirm, setConfirm] = useState(a.transcript !== null);
  const [confirmed, setConfirmed] = useState(false);
  const [replacement, setReplacement] = useState<File[] | null>(null);
  const [notes, setNotes] = useState("");
  useEffect(() => {
    onConfirmed?.(confirmed && !confirm);
  }, [confirmed, confirm, onConfirmed]);
  const locked = ![
    "pending",
    "transcribed",
    ...(onModeChange ? ["unreadable"] : []),
  ].includes(a.status);
  const text = a.transcript ?? a.answer_text ?? "";
  const words = wordCount(text);
  const photo = !!a.image_paths?.length;
  const applyRef = useRef(local);
  useEffect(() => {
    applyRef.current = local;
  });
  useEffect(() => {
    if (a.status !== "marking") return;
    const db = createClient();
    let cancelled = false;
    const tick = async () => {
      const { data } = await db
        .from("attempts")
        .select("status, mark, max_marks, band, feedback")
        .eq("id", a.id)
        .maybeSingle();
      if (cancelled || !data) return;
      if (data.status === "marked" || data.status === "failed")
        applyRef.current({
          status: data.status,
          mark: data.mark,
          max_marks: data.max_marks,
          band: data.band,
          feedback: data.feedback,
        });
    };
    void tick();
    const id = setInterval(() => void tick(), 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [a.id, a.status]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    onBusy(true);
    setError("");
    onError?.("");
    try {
      await fn();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not save your answer.";
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  async function upload(files: File[]) {
    const pageLimit =
      paper || a.question.type === "extended"
        ? LONG_PHOTO_PAGE_LIMIT
        : SHORT_PHOTO_PAGE_LIMIT;
    if ((a.image_paths?.length ?? 0) + files.length > pageLimit)
      throw new Error(`Upload up to ${pageLimit} pages per question.`);
    for (const file of files) {
      if (
        ![
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
        ].includes(file.type) &&
        !/\.hei[cf]$/i.test(file.name)
      )
        throw new Error("Choose a JPEG, PNG, WebP or HEIC photo.");
      if (file.size > ANSWER_PHOTO_BYTE_LIMIT)
        throw new Error("Choose a photo smaller than 10 MB.");
    }
    const ready: File[] = [];
    for (const file of files) {
      if (
        file.type === "image/heic" ||
        file.type === "image/heif" ||
        /\.hei[cf]$/i.test(file.name)
      ) {
        try {
          const bitmap = await createImageBitmap(file);
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
          bitmap.close();
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) =>
                b ? resolve(b) : reject(new Error("Could not convert photo")),
              "image/jpeg",
              0.9,
            ),
          );
          ready.push(
            new File([blob], file.name.replace(/\.hei[cf]$/i, ".jpg"), {
              type: "image/jpeg",
            }),
          );
        } catch {
          throw new Error(
            "This browser couldn't open your HEIC photo. Export it as JPEG, PNG or WebP and upload it again.",
          );
        }
      } else ready.push(file);
    }
    if (ready.some((file) => file.size > ANSWER_PHOTO_BYTE_LIMIT))
      throw new Error("Choose a photo of 10 MB or less after conversion.");
    await flush();
    const paths = [...(a.image_paths ?? [])];
    const batch = Date.now();
    for (const [index, file] of ready.entries()) {
      const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
      const path = `${userId}/${a.id}-${batch}-${index}.${ext}`;
      const db = createClient();
      await withAuthRetry(db, async () => {
        const { error } = await db.storage
          .from("answers")
          .upload(path, file, { contentType: file.type });
        if (error) throw new Error(error.message);
      });
      paths.push(path);
    }
    const patch = {
      image_paths: paths,
      answer_text: null,
      transcript: null,
      status: "pending" as const,
    };
    await save(patch);
    local(patch);
    setConfirm(false);
    setConfirmed(false);
    setNotes("");
  }
  async function readHandwriting() {
    await flush();
    const response = await fetch(`/api/attempts/${a.id}/transcribe`, {
      method: "POST",
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.error ?? "Could not read your photo. Please try again.",
      );
    local({
      transcript: result.transcript,
      status: result.status ?? "transcribed",
    });
    setNotes(result.notes ?? "");
    setConfirm(true);
    setConfirmed(false);
    if (result.unreadable || !result.transcript?.trim()) {
      const message = "We couldn't read this photo.";
      setError(message);
      onError?.(message);
    }
  }
  async function submit() {
    await flush();
    await save(
      photo ? { transcript: a.transcript } : { answer_text: a.answer_text },
    );
    local({ status: "marking" });
    await ensureSession(createClient());
    void fetch(`/api/attempts/${a.id}/mark`, {
      method: "POST",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (response.ok) {
          const result = await response.json();
          local({
            status: result.status ?? "marked",
            mark: result.mark,
            max_marks: result.max_marks,
            band: result.band,
            feedback: result.feedback,
          });
          return;
        }
        if (response.status === 409) return; // already marking; poll will pick it up
        const result = await response.json().catch(() => ({}));
        local({ status: "failed" });
        setError(
          response.status === 429
            ? (result.error ?? "You're going a bit fast, try again in a minute")
            : (result.error ??
                "Could not mark your answer. You can retry on the results page."),
        );
      })
      .catch(() => {
        // Keep "marking" and let the poll catch up if the request was interrupted.
      });
  }
  return (
    <div className="space-y-4">
      {locked ? (
        <>
          <p
            role="status"
            className="text-muted-foreground text-sm font-medium"
          >
            {a.status === "marked"
              ? "Answer marked"
              : a.status === "failed"
                ? "Couldn’t mark this answer. Retry after finishing your sprint."
                : "Submitted, marking in the background"}
          </p>
          <div className="bg-paper rounded-xl p-4 whitespace-pre-wrap">
            {a.transcript ?? a.answer_text ?? "Not answered"}
          </div>
        </>
      ) : (
        <>
          {(mode !== "photo" || photo) && (
            <>
              <label className="grid gap-3 font-semibold">
                {photo ? "Check your transcript" : "Your answer"}
                <Textarea
                  key={a.id}
                  rows={6}
                  className="min-h-36 text-base font-normal"
                  aria-describedby={`answer-guide-${a.id}`}
                  value={text}
                  disabled={busy || disabled}
                  data-question-id={a.question_id}
                  onChange={(e) => {
                    if (
                      wordCount(e.target.value) > MAX_WORDS &&
                      e.target.value.length > text.length
                    )
                      return;
                    edit(
                      photo
                        ? { transcript: e.target.value }
                        : { answer_text: e.target.value },
                    );
                    if (photo) {
                      setConfirm(true);
                      setConfirmed(false);
                    }
                  }}
                />
              </label>
              <p
                id={`answer-guide-${a.id}`}
                className={cn(
                  "text-muted-foreground -mt-2 text-right text-xs tabular-nums",
                  words >= WRITTEN_WORD_WARNING && "text-warning",
                )}
              >
                {plural(words, "word")} · aim for about {a.question.marks * 35}–
                {a.question.marks * 50}
                {words >= WRITTEN_WORD_WARNING &&
                  ` · limit ${MAX_WORDS.toLocaleString()}`}
              </p>
            </>
          )}
          {photo && (confirm || !confirmed) && (
            <div className="space-y-3">
              <p>Check each line before confirming your transcript.</p>
              <ol className="list-decimal space-y-1 pl-6 text-sm">
                {text.split("\n").map((line, i) => (
                  <li key={i}>
                    {line
                      ? line.split(/(\[\?\])/).map((part, j) =>
                          part === "[?]" ? (
                            <span
                              key={j}
                              className="bg-warning-soft rounded px-1 underline decoration-dotted"
                              title="Hard to read. Not counted against you."
                            >
                              {part}
                            </span>
                          ) : (
                            part
                          ),
                        )
                      : "Blank line"}
                  </li>
                ))}
              </ol>
              {notes && <p className="text-sm">{notes}</p>}
              <Button
                variant="outline"
                disabled={busy || disabled || !text.trim() || words > MAX_WORDS}
                onClick={() =>
                  void act(async () => {
                    await flush();
                    await save({ transcript: a.transcript });
                    setConfirm(false);
                    setConfirmed(true);
                  })
                }
              >
                Confirm transcript
              </Button>
            </div>
          )}
          {confirmed && <p role="status">Transcript confirmed.</p>}
          {mode !== "type" && (
            <>
              <label className="grid gap-2 text-sm">
                Take photo / Upload
                <Input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                  capture="environment"
                  disabled={busy || disabled}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length) {
                      if (a.answer_text?.trim() && !a.image_paths?.length)
                        setReplacement(files);
                      else void act(() => upload(files));
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              {!!a.image_paths?.length && (
                <ol className="space-y-2" aria-label="Photo pages">
                  {a.image_paths.map((path, index) => (
                    <li
                      key={path}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span className="mr-auto">Page {index + 1}</span>
                      {([-1, 1] as const).map((delta) => (
                        <Button
                          key={delta}
                          variant="outline"
                          size="sm"
                          disabled={
                            busy ||
                            disabled ||
                            index + delta < 0 ||
                            index + delta >= a.image_paths!.length
                          }
                          aria-label={`Move page ${index + 1} ${delta === -1 ? "up" : "down"}`}
                          onClick={() =>
                            void act(async () => {
                              const paths = [...a.image_paths!];
                              [paths[index], paths[index + delta]] = [
                                paths[index + delta],
                                paths[index],
                              ];
                              await save({
                                image_paths: paths,
                                transcript: null,
                              });
                              local({ image_paths: paths, transcript: null });
                              setConfirm(false);
                              setConfirmed(false);
                            })
                          }
                        >
                          {delta === -1 ? <ArrowUp /> : <ArrowDown />}
                        </Button>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || disabled}
                        aria-label={`Remove page ${index + 1}`}
                        onClick={() =>
                          void act(async () => {
                            const paths = a.image_paths!.filter(
                              (p) => p !== path,
                            );
                            const patch = {
                              image_paths: paths.length ? paths : null,
                              transcript: null,
                            };
                            await save(patch);
                            local(patch);
                            setConfirm(false);
                            setConfirmed(false);
                          })
                        }
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ol>
              )}
              {!!a.image_paths?.length && (
                <Button
                  variant="outline"
                  disabled={busy || disabled}
                  onClick={() => void act(readHandwriting)}
                >
                  Read my handwriting
                </Button>
              )}
            </>
          )}
          {!paper && (
            <Button
              disabled={
                busy ||
                disabled ||
                confirm ||
                !(a.transcript ?? a.answer_text)?.trim()
              }
              onClick={() => void act(submit)}
            >
              Submit answer
            </Button>
          )}
        </>
      )}
      <AlertDialog
        open={replacement !== null}
        onOpenChange={(open) => {
          if (!open) setReplacement(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            Replace your typed answer with the photo?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Your photo will become the answer for this question.
          </AlertDialogDescription>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setReplacement(null)}
            >
              Keep typed answer
            </Button>
            <Button
              disabled={busy || disabled}
              onClick={() => {
                const files = replacement;
                setReplacement(null);
                if (files) void act(() => upload(files));
              }}
            >
              Use photo
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      {busy && <p role="status">Saving or reading your answer…</p>}
      {error && !a.transcript?.trim() && !!a.image_paths?.length && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy || disabled}
            onClick={() =>
              void act(async () => {
                const patch = {
                  image_paths: null,
                  transcript: null,
                  answer_text: null,
                };
                await save(patch);
                local(patch);
                setError("");
                setConfirm(false);
                setConfirmed(false);
              })
            }
          >
            Retake photo
          </Button>
          <Button
            variant="outline"
            disabled={busy || disabled}
            onClick={() =>
              void act(async () => {
                const patch = {
                  image_paths: null,
                  transcript: null,
                  answer_text: "",
                };
                await save(patch);
                local(patch);
                setError("");
                setConfirm(false);
                setConfirmed(false);
                onModeChange?.("type");
              })
            }
          >
            Type it instead
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive break-words">
          {error}
        </p>
      )}
    </div>
  );
}
