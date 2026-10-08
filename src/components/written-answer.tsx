"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { ensureSession, withAuthRetry } from "@/lib/auth-client";
import type { Attempt } from "@/lib/practice";
import { Button } from "./ui/button";
export function WrittenAnswer({
  attempt: a,
  userId,
  edit,
  save,
  flush,
  local,
  disabled,
  onBusy,
}: {
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  attempt: Attempt;
  userId: string;
  edit: (patch: Partial<Attempt>) => void;
  save: (patch: Partial<Attempt>) => Promise<void>;
  flush: () => Promise<void>;
  local: (patch: Partial<Attempt>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(a.transcript !== null);
  const [confirmed, setConfirmed] = useState(false);
  const [lines, setLines] = useState<string[]>(a.transcript?.split("\n") ?? []);
  const [notes, setNotes] = useState("");
  const locked = !["pending", "transcribed"].includes(a.status);
  const photo = a.transcript !== null;
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
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your answer.");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  async function upload(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      throw new Error("Choose a JPEG, PNG or WebP photo.");
    if (file.size > 10 * 1024 * 1024)
      throw new Error("Choose a photo smaller than 10 MB.");
    await flush();
    const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const path = `${userId}/${a.id}-${Date.now()}.${ext}`;
    const db = createClient();
    await withAuthRetry(db, async () => {
      const { error } = await db.storage
        .from("answers")
        .upload(path, file, { contentType: file.type });
      if (error) throw new Error(error.message);
    });
    await save({ image_path: path });
    local({ image_path: path });
    const response = await fetch(`/api/attempts/${a.id}/transcribe`, {
      method: "POST",
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? (result.error ?? "You're going a bit fast, try again in a minute")
          : (result.error ?? "Could not read your photo. Please try again."),
      );
    local({ transcript: result.transcript, status: "transcribed" });
    setLines(result.lines ?? []);
    setNotes(result.notes ?? "");
    setConfirm(true);
    setConfirmed(false);
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
          <p role="status" className="chip">
            {a.status === "marked"
              ? "Answer marked"
              : a.status === "failed"
                ? "Couldn’t mark this answer. Retry after finishing your sprint."
                : "Submitted, marking in the background"}
          </p>
          <div className="bg-paper rounded-2xl p-5 whitespace-pre-wrap">
            {a.transcript ?? a.answer_text ?? "Not answered"}
          </div>
        </>
      ) : (
        <>
          <label className="grid gap-3 font-semibold">
            {photo ? "Check your transcript" : "Your answer"}
            <textarea
              key={a.id}
              className="field min-h-64 font-normal"
              value={a.transcript ?? a.answer_text ?? ""}
              disabled={busy || disabled}
              data-question-id={a.question_id}
              onChange={(e) => {
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
          {photo && confirm && (
            <div className="space-y-3">
              <p>Check each line before confirming your transcript.</p>
              <ol className="list-decimal space-y-1 pl-6 text-sm">
                {lines.map((line, i) => (
                  <li key={i}>{line || "Blank line"}</li>
                ))}
              </ol>
              {notes && <p className="text-sm">{notes}</p>}
              <Button
                variant="outline"
                disabled={busy || disabled}
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
          <label className="grid gap-2 text-sm">
            Upload a photo
            <input
              className="field"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              disabled={busy || disabled}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void act(() => upload(file));
                e.target.value = "";
              }}
            />
          </label>
          {a.image_path && !photo && (
            <Button
              variant="outline"
              disabled={busy || disabled}
              onClick={() =>
                void act(async () => {
                  const r = await fetch(`/api/attempts/${a.id}/transcribe`, {
                    method: "POST",
                  });
                  const v = await r.json();
                  if (!r.ok)
                    throw new Error(
                      r.status === 429
                        ? (v.error ??
                            "You're going a bit fast, try again in a minute")
                        : (v.error ??
                            "Could not read your photo. Please try again."),
                    );
                  local({ transcript: v.transcript, status: "transcribed" });
                  setLines(v.lines);
                  setConfirm(true);
                })
              }
            >
              Retry transcription
            </Button>
          )}
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
        </>
      )}
      {busy && <p role="status">Saving or reading your answer…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
