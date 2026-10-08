import Link from "next/link";
import {
  homeworkCounts,
  estimateMinutes,
  dueLabel,
  daysLeft,
  homeworkStatus,
  type HomeworkSet,
} from "@/lib/homework";
import type { HomeworkSession } from "@/lib/homework-data";
export function HomeworkCard({
  set,
  session,
  hero = false,
}: {
  set: HomeworkSet;
  session?: HomeworkSession;
  hero?: boolean;
}) {
  const c = homeworkCounts(set.items);
  const { status, stageText } = homeworkStatus({
    set,
    session,
    attempts: session?.attempts ?? [],
    reviews: session?.reviews ?? [],
  });
  return (
    <article
      className={`panel space-y-4 p-6 ${hero ? "bg-peach-soft sm:p-8" : ""}`}
    >
      {hero && <p className="eyebrow">This week</p>}
      <p className="text-sm">{set.topic?.name ?? "Economics"}</p>
      <h2 className="break-words">{set.title}</h2>
      <p>
        {c.cards} flashcards · {c.mc} multiple choice · {c.written} short
        answers · {c.marks} marks
      </p>
      <p>
        About {estimateMinutes(set.items)} min · Due {dueLabel(set.due_at)}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="chip">
          {status === "submitted"
            ? `Submitted · ${session?.score}/${session?.max_score}`
            : status === "overdue"
              ? "Overdue"
              : status === "in_progress"
                ? "In progress"
                : "Not started"}
        </span>
        {status !== "submitted" && <span>{daysLeft(set.due_at)}</span>}
      </div>
      {session && !session.finished_at && <p>{stageText}</p>}
      <Link
        className="button-link"
        href={
          session?.finished_at
            ? `/practice/${session.id}/results`
            : `/homework/${set.id}`
        }
      >
        {session?.finished_at
          ? "View results"
          : session
            ? "Continue"
            : "Begin homework"}
      </Link>
    </article>
  );
}
