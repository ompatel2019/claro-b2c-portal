import type { ReviewRow } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { RichText } from "./rich-text";
import { Badge } from "./ui/badge";

const letter = (i: number | null | undefined) =>
  i == null ? null : "ABCDEFGH"[i];

/** §2.1 MC review: badged options, the answer line, and the explanation. */
export function McReview({ row }: { row: ReviewRow }) {
  const chosen = row.choice_index ?? (row.feedback?.chosen_index as number);
  const correct = row.correct_index;
  const right = chosen != null && chosen === correct;
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {row.options?.map((option, i) => (
          <li
            key={i}
            className={cn(
              "flex flex-wrap items-start gap-2 rounded-xl border p-3",
              i === correct && "border-success bg-success-soft",
              i === chosen && !right && "border-destructive",
            )}
          >
            <span className="font-semibold">{letter(i)}.</span>
            <span className="flex-1">{option}</span>
            {i === chosen && (
              <Badge variant={right ? "success" : "destructive"}>
                Your answer
              </Badge>
            )}
            {i === correct && <Badge variant="success">Correct</Badge>}
          </li>
        ))}
      </ul>
      <p className="font-semibold">
        {chosen == null ? "Not answered" : `Your answer: ${letter(chosen)}`} ·
        Correct: {letter(correct) ?? "unavailable"}
      </p>
      {row.explanation && (
        <details open={!right} className="rounded-xl border bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
            Explanation
          </summary>
          <RichText className="px-4 pb-4 text-sm" text={row.explanation} />
        </details>
      )}
    </div>
  );
}
