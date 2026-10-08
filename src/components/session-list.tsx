import Link from "next/link";
import {
  modeLabel,
  dateLabel,
  percentage,
  topicNames,
  type Session,
  type Topic,
} from "@/lib/practice";
export function SessionList({
  sessions,
  topics,
}: {
  sessions: Session[];
  topics: Topic[];
}) {
  return sessions.length ? (
    <ul className="space-y-3">
      {sessions.map((s) => (
        <li key={s.id}>
          <Link
            className="panel hover:border-brand flex flex-wrap items-center justify-between gap-4 p-5"
            href={`/practice/${s.id}${s.finished_at ? "/results" : ""}`}
          >
            <div>
              <p className="font-semibold">{modeLabel(s.config.mode)}</p>
              <p className="mt-1 text-sm">
                {topicNames(s.config.topics, topics)}
              </p>
              <p className="text-muted-foreground mt-2 text-sm">
                {dateLabel(s.started_at)}
              </p>
            </div>
            <span className="chip">
              {s.finished_at
                ? `${s.score}/${s.max_score} · ${percentage(s.score, s.max_score)}`
                : "In progress"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  ) : (
    <p className="panel p-6">
      No sessions yet. Start a sprint to make your first next step.
    </p>
  );
}
