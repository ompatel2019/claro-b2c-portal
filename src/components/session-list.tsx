import Link from "next/link";
import { Cards, History, Sprint } from "@/components/icons";
import {
  modeLabel,
  dateLabel,
  percentage,
  scoreTone,
  topicNames,
  type Session,
  type Topic,
} from "@/lib/practice";
import { EmptyState } from "./empty-state";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
export function SessionList({
  sessions,
  topics,
  empty = "No sessions yet. Start a sprint to make your first next step.",
}: {
  sessions: Session[];
  topics: Topic[];
  empty?: string;
}) {
  if (!sessions.length)
    return (
      <EmptyState icon={History} title="No sessions" description={empty} />
    );
  return (
    <Card className="gap-0 py-0">
      <ul className="divide-y divide-dashed">
        {sessions.map((s) => (
          <li key={s.id}>
            <Link
              prefetch={false}
              className="hover:bg-surface flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3"
              href={`/${s.kind === "flashcards" ? "flashcards" : "student/sprint"}/${s.id}${s.finished_at ? "/results" : ""}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                {s.kind === "flashcards" ? (
                  <Cards
                    aria-hidden
                    className="text-muted-foreground size-5 shrink-0"
                  />
                ) : (
                  <Sprint
                    aria-hidden
                    className="text-muted-foreground size-5 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <p className="font-semibold">
                    {s.kind === "flashcards"
                      ? `Flashcards: ${String(s.config.mode) === "test" ? "Test" : "Study"}`
                      : modeLabel(s.config.mode)}
                  </p>
                  <p className="text-muted-foreground text-[13px]">
                    {topicNames(s.config.topics, topics)} ·{" "}
                    {dateLabel(s.started_at)}
                  </p>
                </div>
              </div>
              {s.finished_at ? (
                <Badge
                  variant={
                    s.max_score
                      ? scoreTone((Number(s.score ?? 0) / s.max_score) * 100)
                      : "secondary"
                  }
                >
                  {`${s.score}/${s.max_score} · ${percentage(s.score, s.max_score)}`}
                </Badge>
              ) : (
                <Badge variant="outline">In progress</Badge>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
