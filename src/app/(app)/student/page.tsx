import { cache, Suspense } from "react";
import Link from "next/link";
import { Cards, Sprint, Target } from "@/components/icons";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { sydneyToday } from "@/lib/flashcards";
import { addDays, type ActivityDay } from "@/lib/activity";
import {
  averages,
  greeting,
  longDate,
  weekCounts,
  type Marked,
} from "@/lib/home";
import {
  answered,
  modeLabel,
  plural,
  scoreTone,
  timeLimit,
  timer,
  type Session,
  type Topic,
} from "@/lib/practice";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { EmptyState } from "@/components/empty-state";
import { FlashcardStart } from "@/components/flashcard-start";
import { PageHeader } from "@/components/page-header";
import { ScoreTrend } from "@/components/score-trend";
import { SessionList } from "@/components/session-list";
import { Shortcut } from "@/components/shortcut";
import { QuickStarts } from "@/components/sprint-setup";
import { StatCard } from "@/components/stat-card";
import { TryAgain } from "@/components/try-again";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Shared per-request reads: each card is its own Suspense boundary but fetches once.
const load = {
  activity: cache(async () => {
    const db = await createClient();
    const [days, streaks] = await Promise.all([
      db.rpc("activity_days", { p_from: addDays(sydneyToday(), -371) }),
      db.rpc("activity_streaks").single(),
    ]);
    if (days.error || streaks.error) throw new Error("activity");
    const s = streaks.data as {
      current_streak: number;
      longest_streak: number;
    };
    return { days: days.data as ActivityDay[], ...s };
  }),
  due: cache(async (userId: string) => {
    const db = await createClient();
    const today = sydneyToday();
    const count = (from: string | null, to: string) => {
      let q = db
        .from("flashcard_progress")
        .select("flashcard_id", { count: "exact", head: true })
        .eq("user_id", userId)
        .lte("due_on", to);
      if (from) q = q.gt("due_on", from);
      return q;
    };
    const [due, tomorrow] = await Promise.all([
      count(null, today),
      count(today, addDays(today, 1)),
    ]);
    if (due.error || tomorrow.error) throw new Error("due");
    return { today: due.count ?? 0, tomorrow: tomorrow.count ?? 0 };
  }),
  marked: cache(async (userId: string): Promise<Marked[]> => {
    const db = await createClient();
    const { data, error } = await db
      .from("attempts")
      .select("mark,max_marks,marked_at,question:questions(type)")
      .eq("user_id", userId)
      .eq("status", "marked")
      .not("marked_at", "is", null)
      .order("marked_at");
    if (error) throw new Error("marked");
    return (
      data as unknown as {
        mark: number;
        max_marks: number;
        marked_at: string;
        question: { type: Marked["type"] } | null;
      }[]
    ).flatMap((a) =>
      a.question && Number(a.max_marks) > 0
        ? [
            {
              day: sydneyToday(new Date(a.marked_at)),
              type: a.question.type,
              mark: Number(a.mark),
              max: Number(a.max_marks),
            },
          ]
        : [],
    );
  }),
  topics: cache(async () => {
    const db = await createClient();
    const { data, error } = await db
      .from("topics")
      .select("id,parent_id,name,sort")
      .order("sort");
    if (error) throw new Error("topics");
    return data as Topic[];
  }),
};

const Skeleton = ({ className }: { className: string }) => (
  <Card aria-hidden className={`bg-muted animate-pulse ${className}`} />
);
const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <Card>
    <CardHeader>
      <CardTitle>
        <h2>{title}</h2>
      </CardTitle>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);
const pct = (n: number | null) => (n == null ? null : Math.round(n));
function Delta({ d, children }: { d: number; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={d > 0 ? "success" : d < 0 ? "destructive" : "secondary"}>
        {d > 0 ? "+" : d < 0 ? "−" : "±"}
        {Math.abs(d)}
      </Badge>
      <span>{children}</span>
    </span>
  );
}

async function Kpis({ userId }: { userId: string }) {
  const data = await Promise.all([
    load.activity(),
    load.due(userId),
    load.marked(userId),
  ]).catch(() => null);
  if (!data)
    return (
      <Card className="p-5">
        <TryAgain what="your stats" />
      </Card>
    );
  const today = sydneyToday();
  const [activity, due, marked] = data;
  const week = weekCounts(activity.days, today);
  const { avg30, prev30 } = averages(marked, today);
  return (
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
          avg30 == null ? (
            "Last 30 days"
          ) : prev30 == null ? (
            "Last 30 days"
          ) : (
            <Delta d={pct(avg30)! - pct(prev30)!}>vs previous 30 days</Delta>
          )
        }
      />
      <StatCard
        label="Streak"
        value={plural(activity.current_streak, "day")}
        caption={`Longest ${activity.longest_streak}`}
      />
      <Link
        href="/student/flashcards"
        className="focus-visible:ring-ring/50 rounded-lg outline-none focus-visible:ring-3"
      >
        <StatCard
          label="Flashcards due"
          value={due.today}
          caption={`${due.tomorrow} more tomorrow`}
        />
      </Link>
    </div>
  );
}

async function Heatmap() {
  const a = await load.activity().catch(() => null);
  return (
    <ActivityHeatmap
      days={a?.days ?? []}
      today={sydneyToday()}
      current={a?.current_streak ?? 0}
      longest={a?.longest_streak ?? 0}
      error={!a}
    />
  );
}

async function Trend({ userId }: { userId: string }) {
  const marked = await load.marked(userId).catch(() => null);
  if (!marked)
    return (
      <Section title="Score trend">
        <TryAgain what="your score trend" />
      </Section>
    );
  if (!marked.length)
    return (
      <EmptyState
        icon={Target}
        title="Score trend"
        description="Finish a sprint to see your trend."
        action={
          <Link href="/student/sprint" className={buttonVariants()}>
            Start sprint
          </Link>
        }
      />
    );
  return (
    <Section title="Score trend">
      <ScoreTrend rows={marked} today={sydneyToday()} />
    </Section>
  );
}

async function Recent({ userId }: { userId: string }) {
  const db = await createClient();
  const [sessions, topics] = await Promise.all([
    db
      .from("sessions")
      .select("*")
      .eq("user_id", userId)
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(5),
    load.topics().catch(() => null),
  ]);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2>Recent activity</h2>
        <Link href="/activity" className="text-primary text-sm font-semibold">
          See all
        </Link>
      </div>
      {sessions.error || !topics ? (
        <Card className="p-5">
          <TryAgain what="your recent activity" />
        </Card>
      ) : (
        <SessionList sessions={sessions.data as Session[]} topics={topics} />
      )}
    </section>
  );
}

const KIND_ICON = { sprint: Sprint, paper: Sprint, flashcards: Cards };

async function Continue({ userId }: { userId: string }) {
  const db = await createClient();
  const { data, error } = await db
    .from("sessions")
    .select(
      "id,kind,config,elapsed_s,started_at,attempts(choice_index,answer_text,transcript,image_paths),flashcard_reviews(flashcard_id)",
    )
    .eq("user_id", userId)
    .is("finished_at", null)
    .order("started_at", { ascending: false })
    .limit(3);
  if (error)
    return (
      <Section title="Continue where you left off">
        <TryAgain what="your unfinished sessions" />
      </Section>
    );
  if (!data.length) {
    const due = await load.due(userId).catch(() => ({ today: 0 }));
    return (
      <Section title="Quick start">
        <div className="grid gap-2">
          <QuickStarts />
          {due.today > 0 && (
            <FlashcardStart
              due
              label={`Review due flashcards (${due.today})`}
              variant="outline"
              className="w-full justify-start"
            />
          )}
        </div>
      </Section>
    );
  }
  return (
    <Section title="Continue where you left off">
      <ul className="divide-y divide-dashed">
        {data.map((s) => {
          const config = s.config as Session["config"] & {
            card_ids?: string[];
          };
          const cards = s.kind === "flashcards";
          const done = cards
            ? new Set(s.flashcard_reviews.map((r) => r.flashcard_id)).size
            : s.attempts.filter(answered).length;
          const total = cards
            ? (config.card_ids?.length ?? 0)
            : s.attempts.length;
          const limit = cards ? null : timeLimit(config);
          const left = limit && limit - (s.elapsed_s ?? 0);
          const Icon = KIND_ICON[s.kind as keyof typeof KIND_ICON] ?? Sprint;
          return (
            <li key={s.id} className="flex items-center gap-3 py-3">
              <Icon
                aria-hidden
                className="text-muted-foreground size-5 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {cards
                    ? `Flashcards · ${String(config.mode) === "test" ? "Test" : "Study"}`
                    : s.kind === "paper"
                      ? "Paper"
                      : `${modeLabel(config.mode)} sprint`}
                </p>
                <p className="text-muted-foreground text-[13px]">
                  {done}/{total} {cards ? "cards" : "answered"}
                  {left != null &&
                    (left > 0
                      ? ` · ${s.kind === "paper" ? "Timer running · " : ""}${timer(left)} left`
                      : " · Out of time")}
                </p>
              </div>
              <Link
                href={`/${cards ? "student/flashcards" : "student/sprint"}/${s.id}`}
                className={buttonVariants({ size: "sm" })}
              >
                Continue
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

async function WeakTopics({ userId }: { userId: string }) {
  const db = await createClient();
  const [progress, topics] = await Promise.all([
    db
      .from("topic_progress")
      .select("topic_id,parent_id,earned,possible,answered")
      .eq("user_id", userId)
      .gte("answered", 3)
      .gt("possible", 0),
    load.topics().catch(() => null),
  ]);
  if (progress.error || !topics)
    return (
      <Section title="Weak topics">
        <TryAgain what="your weak topics" />
      </Section>
    );
  const weak = progress.data
    .map((p) => ({ ...p, pct: (100 * Number(p.earned)) / Number(p.possible) }))
    .sort((a, b) => a.pct - b.pct || a.topic_id.localeCompare(b.topic_id))
    .slice(0, 3);
  return (
    <Section title="Weak topics">
      {weak.length ? (
        <ul className="divide-y divide-dashed">
          {weak.map((t) => (
            <li key={t.topic_id} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                {topics.find((x) => x.id === t.topic_id)?.name ?? t.topic_id}
              </span>
              <Badge variant={scoreTone(t.pct)}>{Math.round(t.pct)}%</Badge>
              <Link
                href={`/student/sprint?topics=${t.parent_id}&sub=${t.topic_id}&history=prefer_new`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Practise
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          Your weak spots show up after 3 marked answers in a topic.
        </p>
      )}
    </Section>
  );
}

async function DueButton({ userId }: { userId: string }) {
  const due = await load.due(userId).catch(() => null);
  return due?.today ? (
    <FlashcardStart
      due
      label={`Flashcards · ${due.today} due`}
      variant="outline"
    />
  ) : null;
}

export default async function Home() {
  const profile = await requireProfile();
  const first = profile.full_name?.trim().split(/\s+/)[0];
  const id = profile.id;
  return (
    <div className="space-y-4">
      <Shortcut k="s" href="/student/sprint" />
      <PageHeader
        eyebrow={longDate()}
        title={`${greeting()}${first ? `, ${first}` : ""}`}
        actions={
          <>
            <Link href="/student/sprint" className={buttonVariants()}>
              Start sprint
            </Link>
            <Suspense>
              <DueButton userId={id} />
            </Suspense>
          </>
        }
      />
      <Suspense
        fallback={
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        }
      >
        <Kpis userId={id} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-52" />}>
        <Heatmap />
      </Suspense>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Suspense fallback={<Skeleton className="h-72" />}>
            <Trend userId={id} />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-64" />}>
            <Recent userId={id} />
          </Suspense>
        </div>
        <div className="min-w-0 space-y-4">
          <Suspense fallback={<Skeleton className="h-48" />}>
            <Continue userId={id} />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-48" />}>
            <WeakTopics userId={id} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
