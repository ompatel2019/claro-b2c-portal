import { redirect } from "next/navigation";
import { loadSprint } from "@/lib/practice-data";
import { modeLabel, topicNames, type Topic } from "@/lib/practice";
import { createClient } from "@/utils/supabase/server";
import { SprintRunner } from "@/components/sprint-runner";
export default async function Sprint({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, attempts, profile } = await loadSprint(id);
  if (session.finished_at) redirect(`/practice/${id}/results`);
  const { data: topics } = await (
    await createClient()
  )
    .from("topics")
    .select("id,parent_id,name,sort");
  return (
    <SprintRunner
      session={session}
      initial={attempts}
      userId={profile.id}
      title={`${modeLabel(session.config.mode)} sprint · ${topicNames(session.config.topics, (topics ?? []) as Topic[])}`}
    />
  );
}
