import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { homeworkColumns } from "@/lib/homework-data";
import { homeworkCounts, dueLabel, type HomeworkSet } from "@/lib/homework";
import { NewHomework } from "@/components/homework-builder";
import type { Topic } from "@/lib/practice";
export default async function AdminHomework() {
  const db = await createClient();
  const [sets, topics, students, sessions] = await Promise.all([
    db
      .from("homework_sets")
      .select(homeworkColumns)
      .order("due_at", { ascending: false })
      .throwOnError(),
    db.from("topics").select("*").order("sort").throwOnError(),
    db
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "student")
      .throwOnError(),
    db
      .from("sessions")
      .select("homework_set_id,finished_at")
      .eq("kind", "homework")
      .throwOnError(),
  ]);
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-5 py-8">
      <h1>Homework builder</h1>
      <NewHomework topics={topics.data as Topic[]} />
      <section className="space-y-4">
        <h2>Homework sets</h2>
        {(sets.data as unknown as HomeworkSet[]).map((set) => {
          const c = homeworkCounts(set.items);
          const runs = (sessions.data ?? []).filter(
            (s) => s.homework_set_id === set.id,
          );
          return (
            <Link
              className="panel block space-y-3 p-6"
              key={set.id}
              href={`/admin/homework/${set.id}`}
            >
              <h3 className="text-xl font-semibold">{set.title}</h3>
              <p>
                {set.topic?.name ?? "All topics"} · Due {dueLabel(set.due_at)}
              </p>
              <p>
                <span className="chip">
                  {set.published_at ? "Published" : "Draft"}
                </span>{" "}
                · {set.items.length} items · {c.marks} total marks
              </p>
              <p>
                {runs.filter((s) => s.finished_at).length} of{" "}
                {students.count ?? 0} students submitted · {runs.length} started
              </p>
            </Link>
          );
        })}
        {!sets.data?.length && (
          <p>No homework sets yet. Create your first draft above.</p>
        )}
      </section>
    </main>
  );
}
