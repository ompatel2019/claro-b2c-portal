"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { DataTable, type Column } from "./data-table";
import { FilterBar } from "./filter-bar";
import { EmptyState } from "./empty-state";
import { StatusPill } from "./status-pill";
import { Sprint, Book, Cards, Pen, History, SearchOff, Close } from "./icons";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent } from "./ui/popover";
import { Button, buttonVariants } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import {
  activityHref,
  type ActivityFilters,
  type ActivityData,
  type ActivityRow,
} from "@/lib/activity-filters";
import { kindLabels, sessionScore, sessionHref } from "@/lib/session-summary";
import {
  plural,
  dateLabel,
  timer,
  scoreTone,
  type Topic,
} from "@/lib/practice";

const subscribeOnline = (change: () => void) => {
  window.addEventListener("online", change);
  window.addEventListener("offline", change);
  return () => {
    window.removeEventListener("online", change);
    window.removeEventListener("offline", change);
  };
};
const onlineSnapshot = () => navigator.onLine;
const serverOnline = () => true;
const icons = { sprint: Sprint, paper: Book, flashcards: Cards, single: Pen };
export function ActivityBrowser({
  filters: f,
  data,
  topics,
  today,
}: {
  filters: ActivityFilters;
  data: ActivityData;
  topics: Topic[];
  today: string;
}) {
  const router = useRouter();
  const online = useSyncExternalStore(
    subscribeOnline,
    onlineSnapshot,
    serverOnline,
  );
  const [from, setFrom] = useState(f.from || today);
  const [to, setTo] = useState(f.to || today);
  const [endpoint, setEndpoint] = useState("from");
  const go = (changes: Record<string, string | number | undefined>) =>
    router.push(activityHref(f, { page: 1, ...changes }));
  const columns: Column<ActivityRow>[] = [
    {
      id: "kind",
      header: "Kind",
      className: "hidden lg:table-cell",
      cell: (r) => {
        const Icon = icons[r.kind as keyof typeof icons] ?? Sprint;
        return (
          <span className="inline-flex items-center gap-2">
            <Icon aria-hidden className="size-4" />
            {r.kind === "sprint"
              ? "Sprint"
              : r.kind === "paper"
                ? "Paper"
                : kindLabels[r.kind as keyof typeof kindLabels]}
          </span>
        );
      },
    },
    {
      id: "title",
      header: "Title",
      className: "w-full max-w-0 !whitespace-normal",
      cell: (r) => {
        const href = sessionHref(r);
        const Icon = icons[r.kind as keyof typeof icons] ?? Sprint;
        return (
          <>
            {href ? (
              <Link
                prefetch={false}
                href={href}
                className="block font-semibold break-words hover:underline focus-visible:outline-2"
              >
                {r.title}
              </Link>
            ) : (
              <span className="block font-semibold break-words">{r.title}</span>
            )}
            <div className="text-muted-foreground mt-1 space-y-1 text-xs">
              <p className="flex items-center gap-2 lg:hidden">
                <Icon aria-hidden className="size-4" />
                {kindLabels[r.kind as keyof typeof kindLabels]}
              </p>
              <p className="sm:hidden">{dateLabel(r.started_at, true)}</p>
              <p className="md:hidden">
                {plural(r.items, r.kind === "flashcards" ? "card" : "question")}
              </p>
              <p className="xl:hidden">{timer(r.elapsed_s)}</p>
              <div className="sm:hidden">
                <StatusPill pill={r.status} />
                {r.provisional && r.status === "Marking" && (
                  <StatusPill pill="Provisional" />
                )}
              </div>
            </div>
            {href && (
              <Link
                prefetch={false}
                className="mt-2 inline-block text-xs font-semibold underline xl:hidden"
                href={href}
              >
                {r.finished_at ? "View" : "Continue"}
                <span className="sr-only"> {r.title}</span>
              </Link>
            )}
          </>
        );
      },
    },
    {
      id: "score",
      header: "Score",
      sort: true,
      cell: (r) =>
        r.pct != null && r.status !== "Marking" && !r.study ? (
          <Badge variant={scoreTone(r.pct)}>
            {sessionScore(r.pct, r.status)}
          </Badge>
        ) : (
          <span
            className="text-muted-foreground text-xs"
            aria-label={r.study ? "Study session, no score" : undefined}
          >
            {sessionScore(r.pct, r.status, r.study)}
          </span>
        ),
    },
    {
      id: "items",
      header: "Items",
      className: "hidden md:table-cell",
      cell: (r) =>
        plural(r.items, r.kind === "flashcards" ? "card" : "question"),
    },
    {
      id: "time",
      header: "Time",
      className: "hidden xl:table-cell",
      cell: (r) => <span className="tabular-nums">{timer(r.elapsed_s)}</span>,
    },
    {
      id: "date",
      header: "Date",
      sort: true,
      className: "hidden sm:table-cell",
      cell: (r) => dateLabel(r.started_at, true),
    },
    {
      id: "status",
      header: "Status",
      className: "hidden sm:table-cell",
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill pill={r.status} />
          {r.provisional && r.status === "Marking" && (
            <StatusPill pill="Provisional" />
          )}
        </div>
      ),
    },
    {
      id: "action",
      header: "Action",
      className: "hidden xl:table-cell",
      cell: (r) =>
        sessionHref(r) ? (
          <Link
            prefetch={false}
            href={sessionHref(r)!}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {r.finished_at ? "View" : "Continue"}
            <span className="sr-only"> {r.title}</span>
          </Link>
        ) : null,
    },
  ];
  const values = {
    status: f.status,
    topic: f.topic,
    q: f.q,
    sort: f.sort === "newest" ? "" : f.sort,
    range: f.range,
  };
  const hidden = {
    kind: f.kind,
    ...(f.date
      ? { date: f.date }
      : f.range === "custom"
        ? { from: f.from, to: f.to }
        : {}),
  };
  return (
    <div className="min-w-0 space-y-4">
      {!online && (
        <p role="status" className="bg-muted rounded-lg px-3 py-2 text-sm">
          You&apos;re offline. We&apos;ll save when you&apos;re back.
        </p>
      )}
      <Card className="gap-4 p-5">
        <ToggleGroup
          aria-label="Session kind"
          value={[f.kind || "all"]}
          onValueChange={(v) => go({ kind: v[0] === "all" ? "" : v[0] || "" })}
          variant="outline"
          size="lg"
          className="max-w-full flex-wrap"
        >
          <ToggleGroupItem value="all">All · {data.kind_total}</ToggleGroupItem>
          {Object.entries(kindLabels).map(([kind, label]) => (
            <ToggleGroupItem key={kind} value={kind}>
              {label} · {data.kinds[kind] || 0}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FilterBar
          activeCount={
            [
              f.kind,
              f.status,
              f.topic,
              f.q,
              f.date || f.range,
              f.sort !== "newest" ? f.sort : "",
            ].filter(Boolean).length
          }
          values={values}
          hidden={hidden}
          clearHref="/student/activity"
          filters={[
            {
              name: "status",
              label: "Status",
              all: "Any status",
              options: [
                { value: "progress", label: "In progress" },
                { value: "marking", label: "Marking" },
                { value: "finished", label: "Finished" },
                { value: "provisional", label: "Has provisional marks" },
              ],
            },
            {
              name: "topic",
              label: "Topic",
              all: "All topics",
              options: topics
                .filter((t) => !t.parent_id)
                .flatMap((t) => [
                  { value: t.id, label: t.name },
                  ...topics
                    .filter((s) => s.parent_id === t.id)
                    .map((s) => ({
                      value: s.id,
                      label: `${t.name} · ${s.name}`,
                    })),
                ]),
            },
            {
              name: "range",
              label: "Date",
              all: "All time",
              clearOnChange: ["date", "from", "to"],
              options: [
                { value: "7", label: "7 days" },
                { value: "30", label: "30 days" },
                { value: "90", label: "90 days" },
                { value: "custom", label: "Custom range" },
              ],
            },
            {
              name: "q",
              label: "Search",
              placeholder: "Search session titles",
            },
            {
              name: "sort",
              label: "Sort",
              all: "Newest",
              options: [
                { value: "oldest", label: "Oldest" },
                { value: "highest", label: "Highest score" },
                { value: "lowest", label: "Lowest score" },
              ],
            },
          ]}
        />
        {f.date && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{dateLabel(f.date, true)}</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => go({ date: "" })}
              aria-label="Remove day filter"
            >
              <Close className="size-3" />
              Remove day
            </Button>
          </div>
        )}
        {f.range === "custom" && (
          <Popover>
            <PopoverPrimitive.Trigger
              render={
                <Button
                  variant="outline"
                  className="h-auto min-h-9 whitespace-normal"
                />
              }
            >
              Choose dates
              {f.from && f.to
                ? ` · ${dateLabel(f.from, true)} to ${dateLabel(f.to, true)}`
                : ""}
            </PopoverPrimitive.Trigger>
            <PopoverContent align="start" className="max-w-[calc(100vw-2rem)]">
              <ToggleGroup
                aria-label="Date range endpoint"
                value={[endpoint]}
                onValueChange={(v) => setEndpoint(v[0] || "from")}
                variant="outline"
              >
                <ToggleGroupItem value="from">From</ToggleGroupItem>
                <ToggleGroupItem value="to">To</ToggleGroupItem>
              </ToggleGroup>
              <Calendar
                key={endpoint}
                label={endpoint === "from" ? "Start date" : "End date"}
                today={today}
                value={endpoint === "from" ? from : to}
                onChange={(d) => (endpoint === "from" ? setFrom(d) : setTo(d))}
              />
              <p className="text-muted-foreground text-xs">
                {dateLabel(from, true)} to {dateLabel(to, true)}
              </p>
              <Button
                onClick={() =>
                  go({
                    from: from < to ? from : to,
                    to: to > from ? to : from,
                    date: "",
                    range: "custom",
                  })
                }
              >
                Apply dates
              </Button>
            </PopoverContent>
          </Popover>
        )}
      </Card>
      {!data.rows.length ? (
        <EmptyState
          icon={data.all_total ? SearchOff : History}
          title={data.all_total ? "No sessions match" : "Nothing here yet"}
          description={
            data.all_total
              ? "Try a different filter to find your session."
              : "Your sprints, papers and checks will appear here."
          }
          action={
            <Link
              href={data.all_total ? "/student/activity" : "/student/sprint"}
              className={buttonVariants()}
            >
              {data.all_total ? "Clear filters" : "Start sprint"}
            </Link>
          }
        />
      ) : (
        <>
          <DataTable
            rows={data.rows}
            columns={columns}
            label="Your activity"
            student
            onRow={(r) => {
              const href = sessionHref(r);
              if (href) router.push(href);
            }}
            sorting={{
              id: ["highest", "lowest"].includes(f.sort) ? "score" : "date",
              dir: ["oldest", "lowest"].includes(f.sort) ? "asc" : "desc",
            }}
            onSortChange={(s) =>
              go({
                sort: !s
                  ? f.sort === "newest"
                    ? "oldest"
                    : "newest"
                  : s.id === "score"
                    ? s.dir === "asc"
                      ? "lowest"
                      : "highest"
                    : s.dir === "asc"
                      ? "oldest"
                      : "newest",
              })
            }
          />
          <nav
            aria-label="Activity pagination"
            className="flex flex-wrap items-center justify-between gap-3 text-sm"
          >
            <p className="text-muted-foreground" aria-live="polite">
              {(data.page - 1) * 20 + 1}–{Math.min(data.page * 20, data.total)}{" "}
              of {data.total} sessions
            </p>
            <div className="flex items-center gap-2">
              {data.page > 1 && (
                <Link
                  href={activityHref(f, { page: data.page - 1 })}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Previous
                </Link>
              )}
              <span className="text-muted-foreground text-xs">
                Page {data.page} of {Math.ceil(data.total / 20)}
              </span>
              {data.page * 20 < data.total && (
                <Link
                  href={activityHref(f, { page: data.page + 1 })}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Next
                </Link>
              )}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
