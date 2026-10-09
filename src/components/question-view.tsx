import type { Attempt } from "@/lib/practice";
import { RichText } from "./rich-text";

/** K12: shared question text, stimulus, marks and source. */
export function QuestionView({
  question,
}: {
  question: Pick<Attempt["question"], "stem" | "stimulus" | "marks" | "source">;
}) {
  return (
    <div className="min-w-0 space-y-3 break-words">
      <p className="text-muted-foreground text-xs">
        {question.marks} {question.marks === 1 ? "mark" : "marks"} ·{" "}
        {question.source}
      </p>
      <RichText
        className="text-base leading-6 font-medium"
        text={question.stem}
      />
      {question.stimulus && (
        <RichText
          className="bg-paper space-y-3 rounded-xl p-4"
          text={question.stimulus}
        />
      )}
    </div>
  );
}
