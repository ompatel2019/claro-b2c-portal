import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { modes, type Session, type Topic } from "@/lib/practice";
import { SessionList } from "@/components/session-list";
import { Button } from "@/components/ui/button";
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
    .eq("kind", "sprint")
    .order("started_at", { ascending: false });
  if (filters.mode && filters.mode in modes)
    query = query.eq("config->>mode", filters.mode);
  if (filters.topic) query = query.contains("config->topics", [filters.topic]);
  const [sessions, topics] = await Promise.all([
    query,
    db.from("topics").select("id,parent_id,name,sort").order("sort"),
  ]);
  if (sessions.error || topics.error)
    throw new Error("Could not load your activity.");
  return (
    <div className="space-y-7">
      <h1>
        Your <em>activity.</em>
      </h1>
      <form method="get" className="panel flex flex-wrap items-end gap-4 p-5">
        <label className="grid gap-2">
          Mode
          <select
            className="field"
            name="mode"
            defaultValue={filters.mode ?? ""}
          >
            <option value="">All modes</option>
            {Object.entries(modes).map(([id, m]) => (
              <option key={id} value={id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-2">
          Topic
          <select
            className="field max-w-full"
            name="topic"
            defaultValue={filters.topic ?? ""}
          >
            <option value="">All topics</option>
            {topics.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">Apply filters</Button>
      </form>
      {sessions.data?.length ? (
        <SessionList
          sessions={sessions.data as Session[]}
          topics={topics.data as Topic[]}
        />
      ) : (
        <p className="panel p-6">
          No sessions match these filters. Try another mode or start a new
          sprint.
        </p>
      )}
    </div>
  );
}
