import { reportHref } from "./progress";
import { modeLabel, topicNames, type Topic } from "./practice";

export const kindLabels = {
  sprint: "Sprints",
  paper: "Papers",
  flashcards: "Flashcards",
  single: "Mark my answer",
};
export const sessionLabels = {
  mcq: `${modeLabel("mcq")} sprint`,
  short: `${modeLabel("short")} sprint`,
  extended: `${modeLabel("extended")} sprint`,
  mixed: `${modeLabel("mixed")} sprint`,
  study: "Flashcards · Study",
  test: "Flashcards · Test",
  paper: "Mock paper",
  single: "Mark my answer",
};
export type SummarySession = {
  kind?: string;
  config: {
    mode?: string;
    topics?: string[];
    subtopics?: string[];
    title?: string;
    question?: { topic_id?: string };
  };
  finished_at?: string | null;
};
export function sessionTitle(
  s: SummarySession,
  topics: Topic[] = [],
  paperTitle?: string | null,
) {
  const base =
    s.kind === "paper"
      ? (paperTitle ?? s.config.title ?? sessionLabels.paper)
      : s.kind === "single"
        ? sessionLabels.single
        : s.kind === "flashcards"
          ? sessionLabels[s.config.mode === "test" ? "test" : "study"]
          : (sessionLabels[s.config.mode as keyof typeof sessionLabels] ??
            "Practice sprint");
  const ids = s.config.subtopics?.length
    ? s.config.subtopics
    : s.config.topics?.length
      ? s.config.topics
      : s.config.question?.topic_id
        ? [s.config.question.topic_id]
        : [];
  return ids.length ? `${base} · ${topicNames(ids, topics)}` : base;
}
export type SessionStatus =
  "In progress" | "Marking" | "Provisional" | "Finished";
export function sessionStatus(
  s: SummarySession,
  attempts: { status: string; check_status?: string }[] = [],
): SessionStatus {
  if (!s.finished_at) return "In progress";
  if (
    attempts.some(
      (a) =>
        ["pending", "transcribed", "marking"].includes(a.status) ||
        (a.status === "marked" && a.check_status === "pending"),
    )
  )
    return "Marking";
  if (attempts.some((a) => a.check_status === "in_review"))
    return "Provisional";
  return "Finished";
}
export function sessionScore(
  pct: number | null,
  status: SessionStatus,
  study = false,
) {
  return study
    ? "—"
    : status === "Marking"
      ? "Marking"
      : pct == null
        ? "No marks yet"
        : `${Math.round(pct)}%`;
}

/** Existing reports and runners; a single check opens its own report. */
export function sessionHref(s: {
  id: string;
  kind?: string;
  paper_id?: string | null;
  finished_at?: string | null;
}) {
  if (s.kind === "single") return `/student/activity/${s.id}`;
  if (s.finished_at)
    return reportHref({
      id: s.id,
      kind: s.kind ?? "sprint",
      paper_id: s.paper_id ?? null,
    });
  if (s.kind === "paper")
    return s.paper_id ? `/student/papers/${s.paper_id}` : null;
  return `/student/${s.kind === "flashcards" ? "flashcards" : "sprint"}/${s.id}`;
}
