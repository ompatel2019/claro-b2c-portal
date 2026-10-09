import type { Attempt } from "@/lib/practice";
import type { Criterion } from "@/lib/feedback";
import { plural } from "@/lib/practice";
import { RichText } from "./rich-text";
import { Badge } from "./ui/badge";

const LETTERS = "ABCD";

type QuestionText = Pick<
  Attempt["question"],
  "stem" | "stimulus" | "marks" | "source"
>;

type QuestionViewProps =
  | { question: QuestionText }
  | (Omit<QuestionText, "stimulus"> & {
      stimulus?: string | null;
      options?: string[] | null;
      /** Post-finish view: badge the key. */
      correct?: number | null;
    });

/** K12: shared student question text and admin preview with optional MC options. */
export function QuestionView(props: QuestionViewProps) {
  const student = "question" in props;
  const { stem, stimulus, marks, source } = student ? props.question : props;
  const options = student ? null : props.options;
  const correct = student ? null : props.correct;
  return (
    <div
      className={
        student
          ? "min-w-0 space-y-3 break-words"
          : "min-w-0 space-y-4 break-words"
      }
    >
      <p
        className={
          student
            ? "text-muted-foreground text-xs"
            : "text-muted-foreground text-sm"
        }
      >
        {student ? (
          <>
            {plural(marks, "mark")} · {source}
          </>
        ) : (
          <>
            {source || "No source"} · {plural(marks, "mark")}
          </>
        )}
      </p>
      <RichText
        renderImages={!student}
        className={
          student ? "text-base leading-6 font-medium" : "block text-base"
        }
        text={student ? stem : stem || "The question stem appears here."}
      />
      {stimulus && (
        <RichText
          renderImages={!student}
          className="bg-paper space-y-3 rounded-xl p-4"
          text={stimulus}
        />
      )}
      {options && (
        <ol className="space-y-2">
          {options.map((o, i) => (
            <li
              key={i}
              className={`flex items-start gap-2 rounded-xl border p-3 ${
                correct === i ? "border-success bg-success-soft" : ""
              }`}
            >
              <span className="font-semibold">{LETTERS[i]}.</span>
              <span className="flex-1">{o || "…"}</span>
              {correct === i && <Badge variant="success">Correct</Badge>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The post-finish extras: criteria table, sample answer, or the MC explanation. */
export function QuestionKey({
  criteria,
  sample,
  explanation,
}: {
  criteria?: Criterion[] | null;
  sample?: string | null;
  explanation?: string | null;
}) {
  return (
    <div className="space-y-4 text-sm">
      {criteria && criteria.length > 0 && (
        <table className="w-full border-collapse text-left">
          <caption className="mb-1 text-left font-semibold">
            Marking guidelines
          </caption>
          <thead>
            <tr className="bg-paper">
              <th className="border-line border px-3 py-2">Marks</th>
              <th className="border-line border px-3 py-2">Descriptor</th>
            </tr>
          </thead>
          <tbody>
            {criteria.map((c, i) => (
              <tr key={i}>
                <td className="border-line border px-3 py-2 whitespace-nowrap">
                  {c.min === c.max ? c.min : `${c.min}–${c.max}`}
                </td>
                <td className="border-line border px-3 py-2">{c.descriptor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {sample && (
        <div>
          <p className="font-semibold">Model answer</p>
          <p className="text-muted-foreground text-xs">
            One strong answer. Other answers can earn the same marks.
          </p>
          <RichText className="mt-2" text={sample} />
        </div>
      )}
      {explanation && (
        <div>
          <p className="font-semibold">Explanation</p>
          <RichText className="mt-2" text={explanation} />
        </div>
      )}
    </div>
  );
}
