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
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
export default async function Results({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session: s, attempts } = await loadSprint(id);
  if (!s.finished_at) redirect(`/practice/${id}`);
  const db = await createClient();
  const { data, error } = await db
    .from("topics")
    .select("id,parent_id,name,sort");
  if (error) throw new Error("Could not load topics.");
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Every answer gives you a next step"
        title="Your results."
        description={`${modeLabel(s.config.mode)} · ${topicNames(s.config.topics, (data ?? []) as Topic[])}`}
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Score"
          value={`${s.score}/${s.max_score}`}
          caption={percentage(s.score, s.max_score)}
        />
        <StatCard label="Time used" value={timer(s.elapsed_s ?? 0)} />
        <StatCard label="Finished" value={dateLabel(s.finished_at)} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {(
          [
            ["Strengths", "strengths"],
            ["Priority Improvements", "improvements"],
            ["Next Study Moves", "next_steps"],
          ] as const
        ).map(([label, key]) => (
          <section key={key} className="panel">
            <h2>{label}</h2>
            {s.summary?.[key]?.length ? (
              <ul className="mt-3 list-disc space-y-2 pl-5">
                {s.summary[key].map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground mt-3">
                A summary isn’t available for this session. Review your answers
                below.
              </p>
            )}
          </section>
        ))}
      </div>
      <section className="space-y-3">
        <h2>Your answers</h2>
        {attempts.map((a, i) => (
          <details className="panel" key={a.id}>
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
            <div className="mt-4 space-y-4">
              <p className="chip">Status: {a.status}</p>
              {a.question.stimulus && (
                <RichText
                  className="bg-paper space-y-3 rounded-xl p-4"
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
