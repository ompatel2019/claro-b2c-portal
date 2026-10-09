import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import {
  parseActivityFilters,
  type ActivityData,
  type SearchParams,
} from "@/lib/activity-filters";
import { sessionLabels } from "@/lib/session-summary";
import { sydneyToday } from "@/lib/flashcards";
import { type Topic } from "@/lib/practice";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ActivityBrowser } from "@/components/activity-browser";
import { buttonVariants } from "@/components/ui/button";
export const metadata = pageMetadata("Activity");

export default async function Activity({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireProfile();
  const today = sydneyToday();
  const filters = parseActivityFilters(await searchParams, today);
  const db = await createClient();
  const [result, topics] = await Promise.all([
    db.rpc("activity_stats", { p_filters: filters, p_labels: sessionLabels }),
    db.from("topics").select("id,parent_id,name,sort").order("sort"),
  ]);
  if (result.error || topics.error || !result.data)
    throw new Error("Couldn't load your activity.");
  const data = result.data as ActivityData;
  const stats = data.stats;
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Your activity"
        description="Everything you've done, all in one place."
        actions={
          <Link href="/student/sprint" className={buttonVariants()}>
            Start sprint
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Sessions"
          value={stats.sessions}
          caption="For your current filters"
        />
        <StatCard
          label="Questions answered"
          value={stats.questions}
          caption="Excludes flashcards"
        />
        <StatCard
          label="Average %"
          empty={stats.average == null}
          value={
            stats.average == null
              ? "No marks yet"
              : `${Math.round(stats.average)}%`
          }
          caption="Scored sessions"
        />
        <StatCard
          label="Best %"
          empty={stats.best == null}
          value={
            stats.best == null ? "No marks yet" : `${Math.round(stats.best)}%`
          }
          caption="Scored sessions"
        />
      </div>
      <ActivityBrowser
        key={JSON.stringify(filters)}
        filters={filters}
        data={data}
        topics={topics.data as Topic[]}
        today={today}
      />
    </div>
  );
}
