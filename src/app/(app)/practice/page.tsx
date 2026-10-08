import { createClient } from "@/utils/supabase/server";
import { PracticeSetup } from "@/components/practice-setup";
import type { Topic } from "@/lib/practice";
import { PageHeader } from "@/components/page-header";
export default async function Practice({
  searchParams,
}: {
  searchParams: Promise<{ topics?: string }>;
}) {
  const db = await createClient();
  const { data, error } = await db
    .from("topics")
    .select("id,parent_id,name,sort")
    .order("sort");
  if (error) throw new Error("Could not load topics.");
  const topics = (data ?? []) as Topic[];
  const requested = (await searchParams).topics?.split(",") ?? [];
  const initial = [...new Set(requested)]
    .filter((id) => topics.some((t) => t.id === id))
    .filter(
      (id) =>
        !requested.includes(topics.find((t) => t.id === id)?.parent_id ?? ""),
    )
    .slice(0, 2);
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="A little practice, a clearer next step"
        title="Build your sprint."
        description="Choose a mode and focus on what you want to improve."
      />
      <PracticeSetup topics={topics} initial={initial} />
    </div>
  );
}
