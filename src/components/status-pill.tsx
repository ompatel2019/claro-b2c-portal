import {
  Alert,
  Check,
  CheckCircle,
  Pending,
  Dot,
  Help,
  Clock,
  EyeOff,
  Spinner,
  Shield,
  type Icon,
} from "@/components/icons";
import type { MarkingState, MarkReview } from "@/lib/feedback";
import { cn } from "@/lib/utils";

/** Fixed vocabulary (§1 K16): every state has an icon, a word and a soft colour. */
const pills = {
  Marking: [Spinner, "bg-muted text-muted-foreground"],
  Marked: [CheckCircle, "bg-success-soft text-success"],
  Provisional: [Clock, "bg-warning-soft text-warning"],
  "Checked by our team": [Shield, "border-success text-success"],
  "Being double-checked": [Pending, "border-warning text-warning"],
  "Couldn't mark": [Alert, "bg-destructive-soft text-destructive"],
  "Couldn't read photo": [Help, "bg-warning-soft text-warning"],
  "Not answered": [EyeOff, "bg-muted text-muted-foreground"],
  "In progress": [Dot, "border-ink text-ink"],
  Finished: [Check, "bg-muted text-muted-foreground"],
} satisfies Record<string, [Icon, string]>;
export type Pill = keyof typeof pills;

export function StatusPill({ pill }: { pill: Pill }) {
  const [Icon, tone] = pills[pill];
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-transparent px-2 text-xs font-medium whitespace-nowrap",
        tone,
      )}
    >
      <Icon
        aria-hidden
        className={cn("size-3", pill === "Marking" && "animate-spin")}
      />
      {pill}
    </span>
  );
}

/** The pill for an attempt's marking state; disputes read "Being double-checked". */
export function statePill(
  state: MarkingState,
  review: MarkReview | null,
): Pill | null {
  if (state === "in_review")
    return review?.reason === "student_dispute"
      ? "Being double-checked"
      : "Provisional";
  return (
    (
      {
        marking: "Marking",
        marked: "Marked",
        reviewed: "Checked by our team",
        failed: "Couldn't mark",
        unreadable: "Couldn't read photo",
        not_answered: "Not answered",
      } as const
    )[state as string] ?? null
  );
}
