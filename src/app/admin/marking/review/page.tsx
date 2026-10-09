import Link from "next/link";
import { Pen } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { EmptyState } from "@/components/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { addSpotChecks } from "./actions";
import { loadQueue } from "./data";
import { reasons } from "./shared";
import { ReviewNotice } from "./notice";
import { QueueTable } from "./queue-table";

const tabs = ["open", "failed", "resolved"];
const labels = ["Open", "Failed & unreadable", "Resolved (last 30 days)"];
export default async function ReviewQueue({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const value = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : undefined;
  const tab = tabs.includes(value("tab") ?? "") ? value("tab")! : "open";
  const reason = tab === "failed" ? undefined : value("reason"),
    type = value("type"),
    age = value("age"),
    topic = value("topic"),
    marks = value("marks");
  const { rows, topics, counts, now } = await loadQueue(tab);
  const shown = rows.filter(
    (r) =>
      (!reason || r.reason === reason) &&
      (!type || r.type === type) &&
      (!topic ||
        r.topic === topic ||
        topics.some((t) => t.id === r.topic && t.parent_id === topic)) &&
      (!marks || r.marks === Number(marks)) &&
      (!age ||
        Date.parse(r.created) < now - (age === "3d" ? 72 : 24) * 3_600_000),
  );
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Marking review"
        description="Check disagreements, student disputes and spot checks. Oldest first."
        actions={
          <form action={addSpotChecks}>
            <Button type="submit">Add 5 spot checks</Button>
          </form>
        }
      />
      <ReviewNotice message={value("notice")} />
      <nav aria-label="Review queues" className="flex flex-wrap gap-2">
        {tabs.map((t, i) => (
          <Link
            key={t}
            href={`?tab=${t}`}
            aria-current={tab === t ? "page" : undefined}
            className={buttonVariants({
              variant: tab === t ? "default" : "outline",
              size: "sm",
            })}
          >
            {labels[i]} ({counts[i]})
          </Link>
        ))}
      </nav>
      <FilterBar
        hidden={{ tab }}
        filters={[
          ...(tab === "failed"
            ? []
            : [
                {
                  name: "reason",
                  label: "Reason",
                  all: "All reasons",
                  options: Object.entries(reasons).map(([value, label]) => ({
                    value,
                    label,
                  })),
                },
              ]),
          {
            name: "type",
            label: "Type",
            all: "All types",
            options: [
              { value: "short", label: "Short" },
              { value: "extended", label: "Extended" },
            ],
          },
          {
            name: "topic",
            label: "Topic",
            all: "All topics",
            options: topics
              .filter((t) =>
                rows.some(
                  (r) =>
                    r.topic === t.id ||
                    topics.some(
                      (sub) => sub.id === r.topic && sub.parent_id === t.id,
                    ),
                ),
              )
              .map((t) => ({ value: t.id, label: t.name })),
          },
          {
            name: "marks",
            label: "Marks",
            all: "All marks",
            options: [
              ...new Set(
                rows.flatMap((r) => (r.marks == null ? [] : [r.marks])),
              ),
            ]
              .sort((a, b) => a - b)
              .map((n) => ({
                value: String(n),
                label: `${n} ${n === 1 ? "mark" : "marks"}`,
              })),
          },
          {
            name: "age",
            label: "Age",
            all: "Any age",
            options: [
              { value: "24h", label: ">24 h" },
              { value: "3d", label: ">3 days" },
            ],
          },
        ]}
        values={{
          reason,
          type,
          topic,
          marks,
          age,
        }}
      />
      {shown.length ? (
        <QueueTable rows={shown} failed={tab === "failed"} />
      ) : (
        <EmptyState
          icon={Pen}
          title={
            rows.length
              ? "No matching reviews"
              : tab === "failed"
                ? "No failed or unreadable answers"
                : tab === "resolved"
                  ? "No recently resolved reviews"
                  : "No open reviews"
          }
          description={
            rows.length
              ? "Change the filters to see more answers."
              : tab === "open"
                ? "Add spot checks to review recently agreed marks."
                : "Answers from the last 30 days appear here."
          }
        />
      )}
    </div>
  );
}
