"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ImagePlus, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { Textarea } from "./ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

const KINDS = {
  general: ["General", "What's on your mind?"],
  bug: ["Bug", "What happened, and what did you expect?"],
  content: ["Content error", "What's wrong with the question or answer?"],
  marking: ["Marking", "What do you think the marker got wrong?"],
  feature: ["Feature idea", "What would make Claro more useful?"],
} as const;
type Kind = keyof typeof KINDS;
type Preset = {
  kind?: Kind;
  questionId?: string;
  flashcardId?: string;
  sessionId?: string;
  /** Chip text, e.g. "Linked: 2023 HSC Q22(b)". */
  label?: string;
};
const TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX = 4000;

const Open = createContext<(preset?: Preset) => void>(() => {});
/** Opens the feedback dialog, optionally preset with a kind and linked item. */
export const useFeedback = () => useContext(Open);

function Thumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <li className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
      <img
        src={url}
        alt={file.name}
        className="size-16 rounded-lg border object-cover"
      />
      <button
        type="button"
        aria-label={`Remove ${file.name}`}
        onClick={onRemove}
        className="bg-ink absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full text-white"
      >
        <X className="size-3" />
      </button>
    </li>
  );
}

/** §2.4: one feedback widget with context — floating button + dialog. */
export function FeedbackWidget({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>({});
  const [kind, setKind] = useState<Kind>("general");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pathSession = pathname.match(
    /^\/(?:practice|flashcards)\/([0-9a-f-]{36})/,
  )?.[1];
  // label "" = the student removed the link chip.
  const sessionId =
    preset.label === ""
      ? undefined
      : (preset.sessionId ?? (preset.label ? undefined : pathSession));
  const chip =
    preset.label === ""
      ? null
      : (preset.label ?? (sessionId && "This session"));

  function show(p: Preset = {}) {
    setPreset(p);
    if (p.kind) setKind(p.kind);
    setError("");
    setOpen(true);
  }
  function add(list: Iterable<File>) {
    const next = [...files];
    let problem = "";
    for (const f of list) {
      if (!TYPES.includes(f.type))
        problem = "Screenshots must be PNG, JPEG or WebP.";
      else if (f.size > 5 * 1024 * 1024)
        problem = "Each screenshot must be 5 MB or less.";
      else if (next.length >= 5) problem = "You can add up to 5 screenshots.";
      else next.push(f);
    }
    setFiles(next);
    setError(problem);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (text.length < 3) return setError("Write at least 3 characters.");
    setBusy(true);
    setError("");
    try {
      const db = createClient();
      const screenshots: string[] = [];
      for (const f of files) {
        const path = `${userId}/${crypto.randomUUID()}.${f.type.split("/")[1]}`;
        const { error } = await db.storage
          .from("reports")
          .upload(path, f, { contentType: f.type });
        if (error) throw error;
        screenshots.push(path);
      }
      const { error } = await db.from("feedback").insert({
        kind,
        message: text,
        page_path: `${pathname}${location.search}`.slice(0, 500),
        user_agent: navigator.userAgent.slice(0, 500),
        screenshots,
        question_id: preset.questionId ?? null,
        flashcard_id: preset.flashcardId ?? null,
        session_id: sessionId ?? null,
      });
      if (error) throw error;
      toast.success("Thanks. We read every message.");
      setOpen(false);
      setMessage("");
      setFiles([]);
      setPreset({});
      setKind("general");
    } catch {
      setError("We couldn’t send that. Your message is still here. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Open.Provider value={show}>
      {children}
      <button
        type="button"
        onClick={() => show()}
        aria-label="Feedback"
        className="group bg-ink fixed right-6 bottom-6 z-40 flex h-12 min-w-12 items-center justify-center gap-2 rounded-full px-3.5 text-white shadow-lg print:hidden"
      >
        <MessageSquare aria-hidden className="size-5" />
        <span className="hidden text-sm font-medium group-hover:inline group-focus-visible:inline">
          Feedback
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-lg"
          onPaste={(e: React.ClipboardEvent) =>
            e.clipboardData.files.length && add(e.clipboardData.files)
          }
        >
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Tell us what’s working and what isn’t.
          </DialogDescription>
          <form onSubmit={submit} className="space-y-4">
            <ToggleGroup
              aria-label="Feedback type"
              variant="outline"
              size="sm"
              className="flex-wrap"
              value={[kind]}
              onValueChange={(v) => v[0] && setKind(v[0] as Kind)}
            >
              {Object.entries(KINDS).map(([value, [label]]) => (
                <ToggleGroupItem key={value} value={value}>
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {chip && (
              <span className="bg-muted inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs font-medium">
                {chip}
                <button
                  type="button"
                  aria-label="Remove link"
                  className="hover:bg-background rounded-full p-0.5"
                  onClick={() => setPreset({ label: "" })}
                >
                  <X className="size-3" />
                </button>
              </span>
            )}
            <div className="space-y-1">
              <Textarea
                aria-label="Message"
                required
                minLength={3}
                maxLength={MAX}
                rows={5}
                value={message}
                placeholder={KINDS[kind][1]}
                onChange={(e) => setMessage(e.target.value)}
              />
              <p className="text-muted-foreground text-right text-xs tabular-nums">
                {message.length}/{MAX}
              </p>
            </div>
            <div
              className="space-y-2 rounded-xl border border-dashed p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                add(e.dataTransfer.files);
              }}
            >
              <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-sm">
                <ImagePlus aria-hidden className="size-4" />
                Add screenshots (paste, drop or pick; up to 5)
                <input
                  type="file"
                  multiple
                  accept={TYPES.join(",")}
                  className="sr-only"
                  aria-label="Add screenshots"
                  onChange={(e) => {
                    add(e.target.files ?? []);
                    e.target.value = "";
                  }}
                />
              </label>
              {files.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {files.map((f, i) => (
                    <Thumb
                      key={`${f.name}-${i}`}
                      file={f}
                      onRemove={() => setFiles(files.filter((_, j) => j !== i))}
                    />
                  ))}
                </ul>
              )}
            </div>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Sending…"
                  : error.startsWith("We couldn’t")
                    ? "Try again"
                    : "Send"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Open.Provider>
  );
}

/** "Report a problem with this question": opens the widget as a content error, linked. */
export function ReportProblem(props: Omit<Preset, "kind">) {
  const open = useFeedback();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => open({ kind: "content", ...props })}
    >
      Report a problem with this question
    </Button>
  );
}
