import { redirect } from "next/navigation";

import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";

export default async function AdminHome() {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/");
  const supabase = await createClient();
  const [{ data: questions }, flashcards, students, { data: usage }] =
    await Promise.all([
      supabase.from("questions").select("type"),
      supabase.from("flashcards").select("*", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "student"),
      supabase.from("ai_usage").select("usd"),
    ]);
  const stats = [
    ["Multiple choice", questions?.filter((q) => q.type === "mcq").length],
    ["Short answer", questions?.filter((q) => q.type === "short").length],
    [
      "Extended response",
      questions?.filter((q) => q.type === "extended").length,
    ],
    ["Flashcards", flashcards.count],
    ["Students", students.count],
    [
      "AI spend (USD)",
      `$${(usage ?? []).reduce((sum, u) => sum + Number(u.usd), 0).toFixed(2)}`,
    ],
  ];
  return (
    <>
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <h1 className="text-4xl font-bold tracking-tight">Admin</h1>
        <Link className="panel mt-6 block space-y-2 p-6" href="/admin/homework">
          <h2>Homework builder</h2>
          <p>
            Create sets, choose flashcards and questions, and track submissions.
          </p>
        </Link>
        <dl className="mt-8 grid gap-4 sm:grid-cols-3">
          {stats.map(([label, value]) => (
            <div key={label} className="panel p-6">
              <dt className="text-muted-foreground text-sm">{label}</dt>
              <dd className="mt-1 font-serif text-4xl">{value ?? 0}</dd>
            </div>
          ))}
        </dl>
      </main>
    </>
  );
}
