import { redirect } from "next/navigation";
import { loadSprint } from "@/lib/practice-data";
import { SprintRunner } from "@/components/sprint-runner";
export default async function Sprint({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, attempts, profile } = await loadSprint(id);
  if (session.finished_at) redirect(`/practice/${id}/results`);
  return (
    <SprintRunner session={session} initial={attempts} userId={profile.id} />
  );
}
