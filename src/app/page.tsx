import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";

export default async function StudentHome() {
  const profile = await requireProfile();
  if (profile.role === "admin") redirect("/admin");
  const supabase = await createClient();
  const [{ data: topics }, { data: questions }] = await Promise.all([
    supabase
      .from("topics")
      .select("id, name")
      .is("parent_id", null)
      .order("sort"),
    supabase.from("questions").select("topic_id"),
  ]);
  const count = (topicId: string) =>
    questions?.filter((q) => q.topic_id.startsWith(`${topicId}-`)).length ?? 0;
  return (
    <>
      <AppHeader name={profile.full_name} />
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <h1 className="text-4xl font-bold tracking-tight">
          Hi {profile.full_name?.split(" ")[0] ?? "there"}
        </h1>
        <p className="text-muted-foreground mt-2 font-serif text-xl italic">
          {questions?.length ?? 0} past HSC questions, ready to practise.
        </p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {topics?.map((t) => (
            <li
              key={t.id}
              className="rounded-card border-line border bg-white p-6"
            >
              <p className="font-semibold">{t.name}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {count(t.id)} questions
              </p>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
