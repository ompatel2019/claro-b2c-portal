import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { History, Close } from "@/components/icons";
import {
  loadSessionReport,
  loadStudentDetail,
  loadStudentFeedback,
} from "@/lib/admin-data";
import {
  FEEDBACK_KIND,
  pageOf,
  pctOf,
  singleParams,
  sydneyDay,
  tableParams,
} from "@/lib/admin";
import { AI_RATE_LIMIT_PER_HOUR } from "@/lib/ai/rate-limit";
import { markingState } from "@/lib/feedback";
import { dateLabel, percentage, plural, scoreTone } from "@/lib/practice";
import { mcGridRows, visibleResults } from "@/lib/results";
import {
  calendarDate,
  filterSessions,
  sessionItems,
  sessionStatus,
  sessionTitle,
  type SessionRow,
} from "@/lib/students";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import {
  ResultsAnswers,
  OverallFeedback,
  type OverallSummary,
} from "@/components/results-report";
import { FeedbackDetail } from "@/components/feedback-detail";
import { UrlSheet } from "@/components/url-sheet";
import { FilterBar } from "@/components/filter-bar";
import { EmptyState } from "@/components/empty-state";
import { LinkTabs } from "@/components/link-tabs";
import { PageHeader } from "@/components/page-header";
import { SessionsTable, type SessionItem } from "@/components/sessions-table";
import { Delta, StatCard } from "@/components/stat-card";
import { ServerTable } from "@/components/static-table-server";
import { StaticTable, type StaticRow } from "@/components/static-table";
import { StatusPill, STATUS_PILL } from "@/components/status-pill";
import { SpotCheck, StudentMenu } from "@/components/student-actions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

const TABS = {
  sessions: "Sessions",
  topics: "Topics",
  reviews: "Reviews & disputes",
  feedback: "Feedback",
  usage: "AI usage",
} as const;
const REASON = {
  check_disagreed: "Check disagreed",
  student_dispute: "Student dispute",
  spot_check: "Spot check",
} as const;
const pct = (n: number | null) => (n == null ? null : Math.round(n));
const SESSION_KEYS: Record<string, (s: SessionItem) => string | number | null> =
  {
    kind: (s) => s.kind,
    title: (s) => s.title,
    score: (s) => (s.max && s.score != null ? (100 * s.score) / s.max : null),
    time: (s) => s.elapsed_s,
    items: (s) => Number.parseInt(s.items),
    date: (s) => s.started_at,
    status: (s) => s.status,
  };

async function Report({
  sessionId,
  userId,
  session,
}: {
  sessionId: string;
  userId: string;
  session: SessionRow | undefined;
}) {
  const r = await loadSessionReport(sessionId, userId);
  if (!r || !session) return <p className="text-sm">Session not found.</p>;
  if (session.kind === "flashcards")
    return (
      <>
        <p className="text-sm">
          {r.finished ? "Finished" : "In progress"} · {sessionItems(session)}
        </p>
        <StaticTable
          label="Flashcard report"
          columns={[
            {
              id: "front",
              header: "Card",
              className: "max-w-48 whitespace-normal break-words",
            },
            {
              id: "answer",
              header: "Answer",
              className: "max-w-48 whitespace-normal break-words",
            },
            { id: "mark", header: "Rating", className: "hidden sm:table-cell" },
            {
              id: "back",
              header: "Model answer",
              className: "max-w-48 whitespace-normal break-words",
            },
          ]}
          rows={r.cards.map((c) => ({
            id: c.id,
            cells: {
              front: c.card?.front ?? "Deleted card",
              answer: c.answer || "Self-rated",
              mark:
                c.mark === 1 ? "Known" : c.mark === 0.5 ? "Learning" : "Missed",
              back: c.card?.back ?? "Unavailable",
            },
          }))}
        />
        {r.cards.length === 0 && (
          <EmptyState
            icon={History}
            title="No cards reviewed"
            description="This student has not reviewed a card in this session."
          />
        )}
      </>
    );
  if (!r.finished)
    return (
      <p className="text-sm">
        In progress · {session.attempts.filter((a) => a.answered).length} of{" "}
        {session.attempts.length} answered
      </p>
    );
  const rows = visibleResults(r.rows);
  const summary = session.summary as OverallSummary | null;
  const sections = Array.isArray(summary?.sections)
    ? summary.sections.map((s) => [s.section, s] as const)
    : Object.entries(summary?.sections ?? {});
  const settled = !rows.some((row) => markingState(row) === "marking");
  return (
    <>
      <p className="text-sm font-medium">
        {settled && session.max_score && session.score != null
          ? `${session.score} / ${session.max_score} · ${percentage(session.score, session.max_score)}`
          : "No score yet"}
      </p>
      {session.config.question?.criteria_text && (
        <Card className="p-5">
          <h2 className="text-base font-semibold">Marking guidelines</h2>
          <p className="mt-3 whitespace-pre-wrap">
            {session.config.question.criteria_text}
          </p>
        </Card>
      )}
      <OverallFeedback
        summary={summary}
        pending={!settled}
        context={session.kind === "paper" ? "paper" : "sprint"}
      />
      {sections.map(([section, summary]) => (
        <OverallFeedback
          key={section}
          section={section}
          summary={summary}
          pending={!settled}
          context="paper"
        />
      ))}
      <ResultsAnswers
        rows={rows}
        id={sessionId}
        name={() => ""}
        photos={r.url}
        mcGrid={mcGridRows(rows)}
        readOnly
        writtenAction={(row) =>
          markingState(row) === "marking" ? null : (
            <SpotCheck attemptId={row.attempt_id} />
          )
        }
      />
      {rows.length === 0 && (
        <EmptyState
          icon={History}
          title="No answers"
          description="There are no answers in this report."
        />
      )}
    </>
  );
}

export const metadata = pageMetadata("Student details");

export default async function StudentDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, raw] = await Promise.all([params, searchParams]);
  const sp = singleParams(raw);
  const d = await loadStudentDetail(id);
  if (!d) notFound();
  const tab = (
    sp.tab && Object.hasOwn(TABS, sp.tab) ? sp.tab : "sessions"
  ) as keyof typeof TABS;
  const { profile } = d;
  const {
    week,
    averages: { avg30, prev30 },
  } = d;
  const last = d.lastActive;
  const base = `/admin/students/${id}`;
  const tabHref = (t: string) => `${base}?tab=${t}`;

  const selectedFeedback =
    tab === "feedback" && sp.feedback
      ? await loadStudentFeedback(sp.feedback, id)
      : null;
  if (sp.feedback && tab === "feedback" && !selectedFeedback) notFound();
  const date = calendarDate(sp.date);
  const sessions = filterSessions(
    d.sessions,
    { ...sp, date: date ?? undefined },
    sydneyDay,
    d.today,
  );
  const items: SessionItem[] = sessions
    .map((s) => ({
      id: s.id,
      kind: s.kind,
      study: s.kind === "flashcards" && s.config.mode !== "test",
      title: sessionTitle(s, d.topics),
      score:
        !s.finished_at || sessionStatus(s) === "Marking" || s.score == null
          ? null
          : Number(s.score),
      max: s.max_score == null ? null : Number(s.max_score),
      items: sessionItems(s),
      elapsed_s: s.elapsed_s ?? 0,
      started_at: s.started_at,
      status: sessionStatus(s),
    }))
    .filter(
      (s) =>
        !sp.q ||
        `${s.id} ${s.kind} ${s.title} ${s.items} ${s.status} ${s.started_at} ${s.score ?? ""}`
          .toLowerCase()
          .includes(sp.q.trim().toLowerCase()),
    );
  const { sort, page } = tableParams(sp, { id: "date", dir: "desc" });
  const paged = pageOf(items, SESSION_KEYS, sort, page, {
    id: "date",
    dir: "desc",
  });
  const open = sp.session ? d.sessions.find((s) => s.id === sp.session) : null;
  if (sp.session && !open) notFound();
  const topicRow = (t: (typeof d.topics)[number]): StaticRow => {
    const p = d.progress.find((p) => p.topic_id === t.id);
    const earned = Number(p?.earned ?? 0),
      possible = Number(p?.possible ?? 0);
    const v = pctOf(earned, possible);
    return {
      id: t.id,
      cells: {
        topic: t.name,
        answered: p?.answered ?? 0,
        marks: `${earned} / ${possible}`,
        pct:
          v == null ? (
            "Not started"
          ) : (
            <Badge variant={scoreTone(v)}>{v}%</Badge>
          ),
        last: p?.last_answered ? dateLabel(p.last_answered, true) : "Never",
      },
      keys: {
        topic: t.name,
        answered: Number(p?.answered ?? 0),
        marks: earned,
        pct: v,
        last: p?.last_answered ?? null,
      },
    };
  };

  return (
    <div className="space-y-4">
      <Link href="/admin/students" className="text-sm underline">
        Back to students
      </Link>
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {profile.full_name || "Unnamed student"}
            {d.blocked && (
              <Badge variant="destructive">
                <Close aria-hidden className="size-3" />
                Blocked
              </Badge>
            )}
          </span>
        }
        description={[
          d.email || "No email",
          profile.year_level ? `Year ${profile.year_level}` : "Year not set",
          profile.school || "School not set",
          `Joined ${dateLabel(profile.created_at, true)}`,
          `Last active ${last ? dateLabel(last, true) : "never"}`,
        ].join(" · ")}
        actions={<StudentMenu userId={id} blocked={d.blocked} />}
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Questions this week"
          value={week.thisWeek}
          caption={
            <Delta d={week.thisWeek - week.lastWeek}>
              vs {week.lastWeek} last week
            </Delta>
          }
        />
        <StatCard
          label="Average mark"
          value={avg30 == null ? "No marks yet" : `${pct(avg30)}%`}
          caption={
            avg30 == null || prev30 == null ? (
              "Last 30 days"
            ) : (
              <Delta d={pct(avg30)! - pct(prev30)!}>vs previous 30 days</Delta>
            )
          }
        />
        <StatCard
          label="Streak"
          value={plural(d.activity.current_streak, "day")}
          caption={`Longest ${d.activity.longest_streak}`}
        />
        <StatCard
          label="Flashcards due"
          value={d.due.today}
          caption={`${d.due.tomorrow} more tomorrow`}
        />
      </div>
      <ActivityHeatmap
        days={d.activity.days}
        today={d.today}
        current={d.activity.current_streak}
        longest={d.activity.longest_streak}
        link={`${base}?tab=sessions&date=`}
      />
      <LinkTabs
        label="Student tabs"
        active={tab}
        tabs={Object.entries(TABS).map(([value, label]) => ({
          value,
          label,
          href: tabHref(value),
        }))}
      />
      <FilterBar
        values={sp}
        hidden={{ tab, date: date ?? undefined }}
        filters={[
          {
            name: "q",
            label: "Search",
            placeholder: `Search ${TABS[tab].toLowerCase()}`,
          },
          ...(tab === "sessions"
            ? [
                {
                  name: "kind",
                  label: "Kind",
                  all: "All",
                  options: [
                    { value: "sprint", label: "Sprints" },
                    { value: "paper", label: "Papers" },
                    { value: "flashcards", label: "Flashcards" },
                    { value: "single", label: "Mark my answer" },
                  ],
                },
                {
                  name: "status",
                  label: "Status",
                  all: "Any",
                  options: [
                    "In progress",
                    "Marking",
                    "Finished",
                    "Provisional",
                  ].map((value) => ({
                    value,
                    label:
                      value === "Provisional" ? "Has provisional marks" : value,
                  })),
                },
                {
                  name: "topic",
                  label: "Topic",
                  all: "Any",
                  options: d.topics.map((t) => ({
                    value: t.id,
                    label: t.name,
                  })),
                },
                {
                  name: "range",
                  label: "Date",
                  all: "All time",
                  options: ["7", "30", "90"].map((value) => ({
                    value,
                    label: `Last ${value} days`,
                  })),
                },
                {
                  name: "from",
                  label: "From",
                  placeholder: "",
                  type: "date" as const,
                },
                {
                  name: "to",
                  label: "To",
                  placeholder: "",
                  type: "date" as const,
                },
              ]
            : []),
        ]}
      />
      {selectedFeedback && (
        <UrlSheet parameter="feedback" title="Feedback">
          <FeedbackDetail
            row={selectedFeedback.row}
            photos={selectedFeedback.photos}
          />
        </UrlSheet>
      )}
      {tab === "sessions" && (
        <>
          {date && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{dateLabel(date, true)}</Badge>
              <Link href={tabHref("sessions")} className="underline">
                Show all days
              </Link>
            </p>
          )}
          {items.length || open ? (
            <SessionsTable
              rows={paged.rows}
              pager={paged.pager}
              report={
                open
                  ? {
                      title: `${sessionTitle(open, d.topics)} · ${dateLabel(open.started_at, true)}`,
                      body: (
                        <Report
                          sessionId={open.id}
                          userId={id}
                          session={open}
                        />
                      ),
                    }
                  : null
              }
            />
          ) : (
            <EmptyState
              icon={History}
              title={
                date
                  ? "No sessions that day"
                  : d.sessions.length
                    ? "No sessions match"
                    : "No sessions yet"
              }
              description={
                date
                  ? "Pick another day on the heatmap."
                  : d.sessions.length
                    ? "Clear filters to see all sessions."
                    : "This student hasn’t started a session."
              }
            />
          )}
        </>
      )}
      {tab === "topics" && (
        <ServerTable
          params={sp}
          label="Marks by topic"
          columns={[
            {
              id: "topic",
              header: "Topic",
              sortable: true,
              className:
                "max-sm:max-w-36 max-sm:whitespace-normal max-sm:break-words",
            },
            {
              id: "answered",
              header: "Answered",
              sortable: true,
              className: "hidden sm:table-cell",
            },
            {
              id: "marks",
              header: "Marks",
              sortable: true,
              className: "hidden sm:table-cell",
            },
            {
              id: "pct",
              header: "%",
              sortable: true,
              className: "max-sm:px-2",
            },
            {
              id: "last",
              header: "Last practised",
              sortable: true,
              className: "hidden sm:table-cell",
            },
          ]}
          rows={d.topics
            .filter((t) => !t.parent_id)
            .map((t) => ({
              ...topicRow(t),
              children: d.topics
                .filter((child) => child.parent_id === t.id)
                .map(topicRow),
            }))}
        />
      )}
      {tab === "reviews" && (
        <ServerTable
          params={sp}
          label="Reviews and disputes"
          columns={[
            {
              id: "when",
              header: "When",
              sortable: true,
              className: "hidden sm:table-cell",
            },
            {
              id: "reason",
              header: "Reason",
              sortable: true,
              className: "hidden sm:table-cell",
            },
            {
              id: "question",
              header: "Question",
              sortable: true,
              className:
                "max-sm:max-w-36 max-sm:whitespace-normal max-sm:break-words",
            },
            {
              id: "marks",
              header: "AI → final",
              sortable: true,
              className: "hidden sm:table-cell",
            },
            {
              id: "status",
              header: "Status",
              sortable: true,
              className: "max-sm:px-2",
            },
          ]}
          rows={d.reviews.map((r) => ({
            id: r.id,
            cells: {
              when: dateLabel(r.created_at, true),
              reason: REASON[r.reason as keyof typeof REASON] ?? r.reason,
              question: r.attempt?.session_id ? (
                <Link
                  className="underline"
                  href={`${base}?tab=sessions&session=${r.attempt.session_id}`}
                >
                  {r.attempt.question?.source ??
                    r.attempt?.question?.stem?.slice(0, 60) ??
                    "Question"}
                </Link>
              ) : (
                "Question"
              ),
              marks: `${r.ai_mark ?? "No AI mark"} → ${r.final_mark ?? "pending"}`,
              status: (
                <StatusPill
                  pill={STATUS_PILL[r.status as keyof typeof STATUS_PILL]}
                />
              ),
            },
            keys: {
              when: r.created_at,
              reason: REASON[r.reason as keyof typeof REASON] ?? r.reason,
              status: r.status,
              question: `${r.attempt?.question?.source ?? ""} ${r.attempt?.question?.stem ?? ""}`,
              marks: `${r.ai_mark ?? "No AI mark"} ${r.final_mark ?? "pending"}`,
            },
          }))}
        />
      )}
      {tab === "feedback" && (
        <ServerTable
          params={sp}
          label="Feedback"
          columns={[
            {
              id: "when",
              header: "Date",
              sortable: true,
              className: "hidden sm:table-cell",
            },
            {
              id: "kind",
              header: "Kind",
              sortable: true,
              className: "hidden sm:table-cell",
            },
            {
              id: "message",
              header: "Message",
              sortable: true,
              className:
                "max-sm:max-w-36 max-sm:whitespace-normal max-sm:break-words",
            },
            {
              id: "status",
              header: "Status",
              sortable: true,
              className: "max-sm:px-2",
            },
          ]}
          rows={d.feedback.map((f) => ({
            id: f.id,
            cells: {
              when: dateLabel(f.created_at, true),
              kind:
                FEEDBACK_KIND[f.kind as keyof typeof FEEDBACK_KIND] ?? f.kind,
              message: (
                <Link
                  className="line-clamp-1 max-w-md whitespace-normal underline"
                  href={`/admin/feedback?status=${f.status}&id=${f.id}`}
                >
                  {f.message}
                </Link>
              ),
              status: (
                <StatusPill
                  pill={STATUS_PILL[f.status as keyof typeof STATUS_PILL]}
                />
              ),
            },
            keys: {
              when: f.created_at,
              kind:
                FEEDBACK_KIND[f.kind as keyof typeof FEEDBACK_KIND] ?? f.kind,
              status: f.status,
              message: f.message,
            },
          }))}
        />
      )}
      {tab === "usage" && (
        <UsageTab
          usage={d.usage}
          lastHour={d.callsLastHour}
          spend={d.spend30}
          params={sp}
        />
      )}
    </div>
  );
}

function UsageTab({
  usage,
  lastHour,
  spend,
  params,
}: {
  usage: {
    task: string;
    calls: number;
    tokens: number;
    usd: number;
  }[];
  lastHour: number;
  spend: number;
  params: Record<string, string | undefined>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Calls in the last hour"
          value={`${lastHour} of ${AI_RATE_LIMIT_PER_HOUR}`}
          caption="Rate limit per student"
        />
        <StatCard label="Spend, last 30 days" value={`$${spend.toFixed(2)}`} />
      </div>
      <ServerTable
        params={params}
        label="AI usage by task"
        columns={[
          {
            id: "task",
            header: "Task",
            sortable: true,
            className:
              "max-sm:max-w-36 max-sm:whitespace-normal max-sm:break-words",
          },
          {
            id: "calls",
            header: "Calls",
            sortable: true,
            className: "hidden sm:table-cell",
          },
          {
            id: "tokens",
            header: "Tokens",
            sortable: true,
            className: "hidden sm:table-cell",
          },
          {
            id: "usd",
            header: "USD",
            sortable: true,
            className: "max-sm:px-2",
          },
        ]}
        rows={usage.map((t) => ({
          id: t.task,
          cells: {
            task: t.task,
            calls: t.calls,
            tokens: t.tokens.toLocaleString("en-AU"),
            usd: `$${t.usd.toFixed(4)}`,
          },
          keys: { task: t.task, calls: t.calls, tokens: t.tokens, usd: t.usd },
        }))}
      />
      <Link
        href="/admin/spend"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Open AI spend
      </Link>
    </div>
  );
}
