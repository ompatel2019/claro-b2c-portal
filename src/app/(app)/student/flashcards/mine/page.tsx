import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { loadMyCards } from "@/lib/my-card-data";
import { sydneyToday } from "@/lib/flashcards";
import type { Topic } from "@/lib/practice";
import { MyCards } from "@/components/my-cards";
import { FilterBar } from "@/components/filter-bar";
import { StatCard } from "@/components/stat-card";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireProfile();
  const db = await createClient();
  const params = Object.fromEntries(
    Object.entries(await searchParams).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const today = sydneyToday();
  const ownProgress = () =>
    db
      .from("flashcard_progress")
      .select("flashcard_id,flashcards!inner(id)", {
        count: "exact",
        head: true,
      })
      .eq("user_id", profile.id)
      .eq("flashcards.owner_id", profile.id)
      .eq("flashcards.status", "live");
  const [topics, total, due, known, { rows, page, pageCount }] =
    await Promise.all([
      db
        .from("topics")
        .select("id,parent_id,name,sort")
        .not("parent_id", "is", null)
        .order("sort")
        .throwOnError(),
      db
        .from("flashcards")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", profile.id)
        .eq("status", "live")
        .throwOnError(),
      ownProgress().lte("due_on", today).throwOnError(),
      ownProgress().gt("due_on", today).eq("last_mark", 1).throwOnError(),
      loadMyCards(db, profile.id, params),
    ]);
  return (
    <MyCards
      key={JSON.stringify(params)}
      rows={rows}
      topics={topics.data as Topic[]}
      total={total.count ?? 0}
      page={page}
      pageCount={pageCount}
      params={params}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total" value={total.count ?? 0} />
        <StatCard label="Due today" value={due.count ?? 0} />
        <StatCard label="Known" value={known.count ?? 0} />
      </div>
      <FilterBar
        values={params}
        filters={[
          { name: "q", label: "Search", placeholder: "Search front and back" },
          {
            name: "kind",
            label: "Kind",
            all: "All kinds",
            options: [
              { value: "term", label: "Term" },
              { value: "stat", label: "Stat" },
            ],
          },
          {
            name: "topic",
            label: "Topic",
            all: "All topics",
            options: (topics.data as Topic[]).map((t) => ({
              value: t.id,
              label: t.name,
            })),
          },
          {
            name: "progress",
            label: "Progress",
            all: "All progress",
            options: ["New", "Learning", "Known", "Due"].map((p) => ({
              value: p.toLowerCase(),
              label: p,
            })),
          },
        ]}
      />
    </MyCards>
  );
}
