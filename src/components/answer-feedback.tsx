import { highlightSegments, type Attempt } from "@/lib/practice";
import { RetryAnswer } from "./retry-answer";
function Points({
  title,
  items,
}: {
  title: string;
  items: string[] | undefined;
}) {
  return items?.length ? (
    <section>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <ul className="list-disc space-y-2 pl-5">
        {items.map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ul>
    </section>
  ) : null;
}
export function AnswerFeedback({ attempt: a }: { attempt: Attempt }) {
  const f = a.feedback;
  const text = a.transcript ?? a.answer_text ?? "";
  const comments = f?.comments ?? [];
  if (a.status === "failed" || a.status === "marking")
    return <RetryAnswer id={a.id} marking={a.status === "marking"} />;
  if (a.question.type === "mcq")
    return (
      <div className="space-y-3">
        <p>
          Your answer:{" "}
          {f?.chosen_index == null ? "Not answered" : "ABCD"[f.chosen_index]}
        </p>
        <p>
          Correct:{" "}
          {f?.correct_index == null
            ? "Answer unavailable"
            : "ABCD"[f.correct_index]}
        </p>
        <ul className="space-y-2">
          {a.question.options?.map((option, i) => (
            <li
              key={i}
              className={`rounded-2xl border p-4 ${f?.correct_index === i ? "border-green-700 bg-green-50" : f?.chosen_index === i ? "border-brand bg-peach" : "border-line"}`}
            >
              {"ABCD"[i]}. {option}
              {f?.correct_index === i
                ? " (Correct)"
                : f?.chosen_index === i
                  ? " (Your answer)"
                  : ""}
            </li>
          ))}
        </ul>
      </div>
    );
  if (!text.trim() || f?.note === "No answer") return <p>Not answered</p>;
  return (
    <div className="space-y-5">
      <p className="font-semibold">Band: {a.band ?? "No band available"}</p>
      <div className="bg-surface rounded-2xl p-5 leading-loose whitespace-pre-wrap">
        {highlightSegments(text, comments).map((s) =>
          s.comments.length ? (
            <span key={s.start}>
              <mark
                className={
                  comments[s.comments[0]].type === "strength"
                    ? "text-ink bg-green-100"
                    : "bg-peach text-ink"
                }
              >
                {s.text}
              </mark>
              {s.comments
                .filter((i) => comments[i].start === s.start)
                .map((i) => (
                  <sup key={i}>
                    <a
                      aria-label={`Comment ${i + 1}`}
                      className="text-brand mx-1 underline"
                      href={`#comment-${a.id}-${i}`}
                    >
                      {i + 1}
                    </a>
                  </sup>
                ))}
            </span>
          ) : (
            <span key={s.start}>{s.text}</span>
          ),
        )}
      </div>
      {comments.length > 0 && (
        <ol className="list-decimal space-y-3 pl-5">
          {comments.map((c, i) => (
            <li className="scroll-mt-8" id={`comment-${a.id}-${i}`} key={i}>
              <span className="font-semibold">
                {c.type === "strength" ? "Strength" : "Improvement"}
              </span>
              {c.quote && (
                <blockquote className="my-1 text-sm">“{c.quote}”</blockquote>
              )}
              {c.comment}
            </li>
          ))}
        </ol>
      )}
      {f?.justification && <p>{f.justification}</p>}
      <Points title="What earned marks" items={f?.earned} />
      <Points title="What’s missing" items={f?.missing_points} />
      {(f?.next_band || f?.why_not_higher) && (
        <section>
          <h3 className="mb-2 font-semibold">Your next band</h3>
          <p>{f?.next_band}</p>
          <p className="mt-2">{f?.why_not_higher}</p>
        </section>
      )}
      <Points title="Better-answer outline" items={f?.better_answer_outline} />
    </div>
  );
}
