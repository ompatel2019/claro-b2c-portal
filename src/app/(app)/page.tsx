import Link from "next/link";
import { Target } from "@/components/icons";
import { sydneyToday } from "@/lib/flashcards";
import { addDays, type ActivityDay } from "@/lib/activity";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { QuickStarts } from "@/components/sprint-setup";
import { SessionList } from "@/components/session-list";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  answered,
  modeLabel,
  scoreTone,
  timer,
  type Session,
  type Topic,
} from "@/lib/practice";
export default async function Dashboard() {
  const profile = await requireProfile();
  const db = await createClient();
  const [
    statsResult,
    unfinished,
    recent,
    topicResult,
    questionResult,
    dueResult,
    activity,
    streaks,
  ] = await Promise.all([
    db.rpc("dashboard_stats"),
    db
      .from("sessions")
      .select("*,attempts(choice_index,answer_text,transcript)")
      .eq("user_id", profile.id)
      .eq("kind", "sprint")
      .is("finished_at", null)
      .order("started_at", { ascending: false })
      .limit(1),
    db
      .from("sessions")
      .select("*")
      .eq("user_id", profile.id)
      .eq("kind", "sprint")
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(3),
    db.from("topics").select("id,parent_id,name,sort").order("sort"),
    db.from("questions").select("topic_id"),
    db
      .from("flashcard_progress")
      .select("flashcard_id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .lte("due_on", sydneyToday()),
    db.rpc("activity_days", { p_from: addDays(sydneyToday(), -371) }),
    db.rpc("activity_streaks").single(),
  ]);
  for (const result of [
    statsResult,
    unfinished,
    recent,
    topicResult,
    questionResult,
    dueResult,
  ])
    if (result.error) throw new Error("Could not load your dashboard.");
  const stats = statsResult.data as {
    sessions_this_week: number;
    average_pct: number | null;
    finished_total: number;
    streak_days: number;
    weakest: { id: string; name: string; pct: number; answered: number }[];
  };
  const continuing = unfinished.data?.[0];
  const topics = (topicResult.data ?? []).filter((t) => !t.parent_id);
  const questionCount = (id: string) =>
    (questionResult.data ?? []).filter((q) => q.topic_id.startsWith(`${id}-`))
      .length;
  const card = (title: string, body: React.ReactNode) => (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Your economics practice, made clearer"
        title={`Hi ${profile.full_name?.trim().split(/\s+/)[0] || "there"}.`}
        description="One focused sprint. One useful next step."
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Sessions this week" value={stats.sessions_this_week} />
        <StatCard
          label="Average score"
          value={
            stats.finished_total && stats.average_pct !== null
              ? `${Math.round(stats.average_pct)}%`
              : "No scores yet"
          }
        />
        <StatCard label="Streak days" value={stats.streak_days} />
        <StatCard
          label={
            <Link href="/flashcards" className="underline">
              Due today
            </Link>
          }
          value={dueResult.count ?? 0}
          caption="Flashcards for review"
        />
      </div>
      <ActivityHeatmap
        days={(activity.data ?? []) as ActivityDay[]}
        today={sydneyToday()}
        current={
          (streaks.data as { current_streak: number } | null)?.current_streak ??
          0
        }
        longest={
          (streaks.data as { longest_streak: number } | null)?.longest_streak ??
          0
        }
        error={!!(activity.error || streaks.error)}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {card("Quick start", <QuickStarts />)}
          {card(
            "Practise by topic",
            <ul className="grid gap-3 sm:grid-cols-2">
              {topics.map((t) => (
                <li key={t.id}>
                  <Link
                    className="hover:border-brand flex h-full flex-col gap-1 rounded-xl border p-4 transition-colors"
                    href={`/student/sprint?topics=${t.id}`}
                  >
                    <span className="font-semibold">{t.name}</span>
                    <span className="text-muted-foreground text-[13px]">
                      {questionCount(t.id)} past HSC questions · Set up a sprint
                    </span>
                  </Link>
                </li>
              ))}
            </ul>,
          )}
          <section className="space-y-3">
            <h2>Recent sessions</h2>
            <SessionList
              sessions={(recent.data ?? []) as Session[]}
              topics={(topicResult.data ?? []) as Topic[]}
            />
          </section>
        </div>
        <div className="min-w-0 space-y-4">
          {continuing &&
            card(
              "Continue your sprint",
              <>
                <p className="text-muted-foreground mb-4 text-[13px]">
                  {modeLabel((continuing as Session).config.mode)} ·{" "}
                  {continuing.attempts.filter(answered).length}/
                  {continuing.attempts.length} answered ·{" "}
                  {timer(continuing.elapsed_s ?? 0)} used
                </p>
                <Link
                  className="button-link"
                  href={`/student/sprint/${continuing.id}`}
                >
                  Continue
                </Link>
              </>,
            )}
          {stats.weakest.length ? (
            card(
              "Focus for next time",
              <ul className="divide-y divide-dashed">
                {stats.weakest.map((t) => (
                  <li key={t.id}>
                    <Link
                      className="flex items-center justify-between gap-3 py-3"
                      href={`/student/sprint?sub=${encodeURIComponent(t.id)}&history=prefer_new`}
                    >
                      <span>{t.name}</span>
                      <Badge variant={scoreTone(t.pct)}>
                        {Math.round(t.pct)}%
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>,
            )
          ) : (
            <EmptyState
              icon={Target}
              title="Focus for next time"
              description="Your focus areas will appear after you finish a sprint."
            />
          )}
        </div>
      </div>
    </div>
  );
}
