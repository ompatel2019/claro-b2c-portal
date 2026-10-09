import { pageMetadata } from "@/lib/page-metadata";
import { redirect } from "next/navigation";
import { loadSprint } from "@/lib/practice-data";
import { modeLabel, topicNames, type Topic } from "@/lib/practice";
import { createClient } from "@/utils/supabase/server";
import { SprintRunner } from "@/components/sprint-runner";
export const metadata = pageMetadata("Sprint session");

export default async function Sprint({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, attempts, profile } = await loadSprint(id);
  if (session.finished_at) redirect(`/student/sprint/${id}/results`);
  const db = await createClient();
  const [{ data: topics }, { data: before }] = await Promise.all([
    db.from("topics").select("id,parent_id,name,sort"),
    // "Seen before" = answered in another finished session (§3.2 rule).
    db
      .from("attempts")
      .select("question_id,sessions!inner(finished_at)")
      .eq("user_id", profile.id)
      .neq("session_id", id)
      .not("sessions.finished_at", "is", null)
      .neq("status", "skipped")
      .in(
        "question_id",
        attempts.map((a) => a.question_id),
      ),
  ]);
  const list = (topics ?? []) as Topic[];
  return (
    <SprintRunner
      session={session}
      initial={attempts}
      userId={profile.id}
      title={`${modeLabel(session.config.mode)} sprint · ${topicNames(session.config.topics, list)}`}
      topicNames={Object.fromEntries(list.map((t) => [t.id, t.name]))}
      seen={[...new Set((before ?? []).map((r) => r.question_id as string))]}
    />
  );
}
