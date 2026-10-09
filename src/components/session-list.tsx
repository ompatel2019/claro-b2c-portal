import {
  sessionTitle,
  sessionStatus,
  sessionScore,
  sessionHref,
  isStudentSession,
} from "@/lib/session-summary";
import Link from "next/link";
import { Cards, History, Pen, Sprint } from "@/components/icons";
import { dateLabel, scoreTone, type Session, type Topic } from "@/lib/practice";
import { StatusPill } from "./status-pill";
import { EmptyState } from "./empty-state";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
export function SessionList({
  sessions: suppliedSessions,
  topics,
  empty = "No sessions yet. Start a sprint to make your first next step.",
}: {
  sessions: (Session & {
    attempts?: { status: string; check_status?: string }[];
  })[];
  topics: Topic[];
  empty?: string;
}) {
  const sessions = suppliedSessions.filter(isStudentSession);
  if (!sessions.length)
    return (
      <EmptyState icon={History} title="No sessions" description={empty} />
    );
  return (
    <Card className="gap-0 py-0">
      <ul className="divide-y divide-dashed">
        {sessions.map((s) => {
          const href = sessionHref(s);
          const content = (
            <>
              <div className="flex min-w-0 items-center gap-3">
                {s.kind === "flashcards" ? (
                  <Cards
                    aria-hidden
                    className="text-muted-foreground size-5 shrink-0"
                  />
                ) : s.kind === "single" ? (
                  <Pen
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
                  <p className="font-semibold">{sessionTitle(s, topics)}</p>
                  <p className="text-muted-foreground text-[13px]">
                    {dateLabel(s.started_at)}
                  </p>
                </div>
              </div>
              {s.finished_at ? (
                <Badge
                  variant={
                    s.max_score && sessionStatus(s, s.attempts) !== "Marking"
                      ? scoreTone((Number(s.score ?? 0) / s.max_score) * 100)
                      : "secondary"
                  }
                >
                  {sessionScore(
                    s.score != null && s.max_score
                      ? (100 * s.score) / s.max_score
                      : null,
                    sessionStatus(s, s.attempts),
                    s.kind === "flashcards" &&
                      String(s.config.mode) === "study",
                  )}
                </Badge>
              ) : (
                <StatusPill pill="In progress" />
              )}
            </>
          );
          const className =
            "hover:bg-surface flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3";
          return (
            <li key={s.id}>
              {href ? (
                <Link href={href} prefetch={false} className={className}>
                  {content}
                </Link>
              ) : (
                <div className={className}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
