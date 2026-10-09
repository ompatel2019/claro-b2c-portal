"use client";
import { useState, useTransition, useRef } from "react";
import { toast } from "sonner";
import { saveMyCard } from "@/app/(app)/flashcards/my-card-actions";
import { cardSchema, type CardInput } from "@/lib/card-import";
import type { Topic } from "@/lib/practice";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
export const KINDS = [
  { value: "term", label: "Term" },
  { value: "stat", label: "Stat" },
];
export const topicOptions = (topics: Topic[]) =>
  topics.map((t) => ({ value: t.id, label: t.name }));
/** Labelled kit Select; "" means nothing chosen and shows the placeholder. */
export function Choose({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      {label}
      <Select
        value={value || null}
        items={options}
        onValueChange={(v) => onChange(v ?? "")}
      >
        <SelectTrigger aria-label={label} className="h-9 w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
export function CardEditor({
  card,
  topics,
  onClose,
}: {
  card?: CardInput & { id: string };
  topics: Topic[];
  onClose: () => void;
}) {
  const [id, setId] = useState(card?.id);
  const [value, setValue] = useState<CardInput>(
    card ?? { front: "", back: "", topic_id: "", kind: "term" },
  );
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const front = useRef<HTMLInputElement>(null);
  const patch = (next: Partial<CardInput>) => {
    setValue((v) => ({ ...v, ...next }));
    setError("");
  };
  function save(another: boolean) {
    if (pending) return;
    const checked = cardSchema.safeParse(value);
    if (!checked.success) return setError(checked.error.issues[0].message);
    start(async () => {
      try {
        const result = await saveMyCard(checked.data, id);
        if (result.error) return setError(result.error);
        toast.success(result.warning ?? "Card saved.", { duration: 4000 });
        if (!another) return onClose();
        setId(undefined);
        setValue((v) => ({ ...v, front: "", back: "" }));
        front.current?.focus();
      } catch {
        setError("Couldn't save your card. Try again.");
      }
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>{id ? "Edit card" : "Add card"}</DialogTitle>
        <DialogDescription>
          Write the prompt on the front and the answer on the back.
        </DialogDescription>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save(false);
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              save(true);
            }
          }}
        >
          <Choose
            label="Kind"
            value={value.kind}
            options={KINDS}
            onChange={(kind) => patch({ kind: kind as CardInput["kind"] })}
          />
          <Choose
            label="Topic"
            value={value.topic_id}
            options={topicOptions(topics)}
            placeholder="Choose a subtopic"
            onChange={(topic_id) => patch({ topic_id })}
          />
          <label className="grid min-w-0 gap-1">
            Front
            <Input
              ref={front}
              aria-label="Front"
              value={value.front}
              onChange={(e) => patch({ front: e.target.value })}
            />
          </label>
          <label className="grid min-w-0 gap-1">
            Back
            <Textarea
              aria-label="Back"
              value={value.back}
              onChange={(e) => patch({ back: e.target.value })}
            />
          </label>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-keyshortcuts="Meta+Enter Control+Enter"
              disabled={pending}
              onClick={() => save(true)}
            >
              Save and add another
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            ⌘Enter saves and adds another.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
