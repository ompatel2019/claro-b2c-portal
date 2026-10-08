import Link from "next/link";
import { sydneyToday } from "@/lib/flashcards";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { QuickStarts } from "@/components/practice-setup";
import { SessionList } from "@/components/session-list";
import {
  answered,
  modeLabel,
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
  return (
    <div className="space-y-9">
      <div>
        <p className="eyebrow">Your economics practice, made clearer</p>
        <h1>
          Hi <em>{profile.full_name?.trim().split(/\s+/)[0] || "there"}.</em>
        </h1>
        <p className="mt-3">One focused sprint. One useful next step.</p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Sessions this week", stats.sessions_this_week],
          [
            "Average score",
            stats.finished_total && stats.average_pct !== null
              ? `${Math.round(stats.average_pct)}%`
              : "No scores yet",
          ],
          ["Streak days", stats.streak_days],
        ].map(([label, value]) => (
          <div className="panel p-6" key={label}>
            <dt className="text-sm">{label}</dt>
            <dd className="mt-3 font-serif text-4xl">{value}</dd>
          </div>
        ))}
        <div className="panel p-6">
          <dt className="text-sm">
            <Link href="/flashcards" className="underline">
              Due today
            </Link>
          </dt>
          <dd className="mt-3 font-serif text-4xl">{dueResult.count ?? 0}</dd>
          <p className="mt-2 text-sm">Flashcards for review</p>
        </div>
      </dl>
      {continuing && (
        <section className="panel bg-peach-soft p-6">
          <p className="font-hand text-2xl">Pick up where you left off</p>
          <h2 className="mt-2">Continue your sprint</h2>
          <p className="my-4">
            {modeLabel((continuing as Session).config.mode)} ·{" "}
            {continuing.attempts.filter(answered).length}/
            {continuing.attempts.length} answered ·{" "}
            {timer(continuing.elapsed_s ?? 0)} used
          </p>
          <Link className="button-link" href={`/practice/${continuing.id}`}>
            Continue
          </Link>
        </section>
      )}
      <section className="space-y-4">
        <h2>Quick start</h2>
        <QuickStarts />
      </section>
      <section className="space-y-4">
        <h2>Practise by topic</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {topics.map((t) => (
            <li key={t.id}>
              <Link
                className="panel hover:border-brand flex h-full flex-col gap-2 p-5 transition-colors"
                href={`/practice?topics=${t.id}`}
              >
                <span className="font-semibold">{t.name}</span>
                <span className="text-muted-foreground text-sm">
                  {questionCount(t.id)} past HSC questions · Set up a sprint
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-4">
        <h2>Focus for next time</h2>
        {stats.weakest.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {stats.weakest.map((t) => (
              <li key={t.id}>
                <Link
                  className="panel flex items-center justify-between gap-3 p-5"
                  href={`/practice?topics=${encodeURIComponent(t.id)}`}
                >
                  <span>{t.name}</span>
                  <span className="chip">{Math.round(t.pct)}%</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel p-6">
            Your focus areas will appear after you finish a sprint.
          </p>
        )}
      </section>
      <section className="space-y-4">
        <h2>Recent sessions</h2>
        <SessionList
          sessions={(recent.data ?? []) as Session[]}
          topics={(topicResult.data ?? []) as Topic[]}
        />
      </section>
    </div>
  );
}
