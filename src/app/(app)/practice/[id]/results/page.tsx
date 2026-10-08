import Link from "next/link";
import { loadHomework } from "@/lib/homework-data";
import { cardIds } from "@/lib/homework";
import { redirect } from "next/navigation";
import { loadSprint } from "@/lib/practice-data";
import { createClient } from "@/utils/supabase/server";
import {
  modeLabel,
  percentage,
  dateLabel,
  timer,
  topicNames,
  type Topic,
} from "@/lib/practice";
import { RichText } from "@/components/rich-text";
import { AnswerFeedback } from "@/components/answer-feedback";
export default async function Results({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session: s, attempts } = await loadSprint(id);
  if (!s.finished_at)
    redirect(
      s.kind === "homework"
        ? `/homework/${s.homework_set_id}/do`
        : `/practice/${id}`,
    );
  const homework =
    s.kind === "homework" ? await loadHomework(s.homework_set_id!) : null;
  const db = await createClient();
  const { data, error } = await db
    .from("topics")
    .select("id,parent_id,name,sort");
  if (error) throw new Error("Could not load topics.");
  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Every answer gives you a next step</p>
        {homework && (
          <>
            <p className="text-xl font-semibold">{homework.set.title}</p>
            <Link href="/homework" className="underline">
              Back to homework
            </Link>
          </>
        )}
        <h1>
          Your <em>results.</em>
        </h1>
      </div>
      <section className="panel bg-peach-soft p-6">
        <h2>Score</h2>
        <p className="my-4 font-serif text-5xl">
          {s.score}/{s.max_score}{" "}
          <span className="text-2xl">({percentage(s.score, s.max_score)})</span>
        </p>
        {homework && (
          <p>
            Flashcards: {cardIds(homework.set).length} cards ·{" "}
            {homework.session?.reviews.filter((r) => r.mark < 1).length ?? 0}{" "}
            retries
          </p>
        )}
        <p>
          {homework ? "Homework" : modeLabel(s.config.mode)} ·{" "}
          {topicNames(s.config.topics, (data ?? []) as Topic[])}
        </p>
        <p className="mt-2">
          {timer(s.elapsed_s ?? 0)} used · {dateLabel(s.finished_at)}
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        {(
          [
            ["Strengths", "strengths"],
            ["Priority Improvements", "improvements"],
            ["Next Study Moves", "next_steps"],
          ] as const
        ).map(([label, key]) => (
          <section key={key} className="panel p-5">
            <h2 className="text-xl">{label}</h2>
            {s.summary?.[key]?.length ? (
              <ul className="mt-4 list-disc space-y-3 pl-5">
                {s.summary[key].map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-4">
                A summary isn’t available for this session. Review your answers
                below.
              </p>
            )}
          </section>
        ))}
      </div>
      <section className="space-y-4">
        <h2>Your answers</h2>
        {attempts.map((a, i) => (
          <details className="panel p-5 sm:p-6" key={a.id}>
            <summary className="cursor-pointer space-y-2">
              <span className="font-semibold">
                Question {i + 1} · {a.question.source} {a.question.year ?? ""}
              </span>
              <span className="ml-3 inline-block text-sm">
                {a.status === "marked"
                  ? `${a.mark}/${a.max_marks ?? a.question.marks}`
                  : a.status === "failed"
                    ? "Couldn’t mark this answer"
                    : "Still marking"}
              </span>
              <RichText className="mt-2 block" text={a.question.stem} />
            </summary>
            <div className="mt-6 space-y-5">
              <p className="chip">Status: {a.status}</p>
              {a.question.stimulus && (
                <RichText
                  className="bg-paper space-y-3 rounded-2xl p-4"
                  text={a.question.stimulus}
                />
              )}
              <AnswerFeedback attempt={a} />
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
