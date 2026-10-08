import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { modes, type Session, type Topic } from "@/lib/practice";
import { SessionList } from "@/components/session-list";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
export default async function Activity({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; topic?: string }>;
}) {
  const profile = await requireProfile();
  const filters = await searchParams;
  const db = await createClient();
  let query = db
    .from("sessions")
    .select("*")
    .eq("user_id", profile.id)
    .in("kind", ["sprint", "flashcards"])
    .order("started_at", { ascending: false });
  if (
    filters.mode &&
    (filters.mode in modes || ["study", "test"].includes(filters.mode))
  )
    query = query.eq("config->>mode", filters.mode);
  if (filters.topic) query = query.contains("config->topics", [filters.topic]);
  const [sessions, topics] = await Promise.all([
    query,
    db.from("topics").select("id,parent_id,name,sort").order("sort"),
  ]);
  if (sessions.error || topics.error)
    throw new Error("Could not load your activity.");
  return (
    <div className="space-y-4">
      <PageHeader title="Your activity." />
      <FilterBar
        values={filters}
        filters={[
          {
            name: "mode",
            label: "Mode",
            all: "All modes",
            options: [
              ...Object.entries(modes).map(([id, m]) => ({
                value: id,
                label: m.label,
              })),
              { value: "study", label: "Flashcards: Study" },
              { value: "test", label: "Flashcards: Test" },
            ],
          },
          {
            name: "topic",
            label: "Topic",
            all: "All topics",
            options: (topics.data ?? []).map((t) => ({
              value: t.id,
              label: t.name,
            })),
          },
        ]}
      />
      <SessionList
        sessions={(sessions.data ?? []) as Session[]}
        topics={topics.data as Topic[]}
        empty="No sessions match these filters. Try another mode or start a new session."
      />
    </div>
  );
}
