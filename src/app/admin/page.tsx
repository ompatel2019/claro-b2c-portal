import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { loadSpend } from "@/lib/admin-data";

export default async function AdminHome() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: questions }, flashcards, students, spend] = await Promise.all([
    supabase.from("questions").select("type"),
    supabase.from("flashcards").select("*", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "student"),
    loadSpend(),
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
    ["AI spend (USD)", `$${spend.all.toFixed(2)}`],
  ];
  const cards = [
    [
      "Homework builder",
      "Create sets, choose flashcards and questions, and track submissions.",
      "/admin/homework",
    ],
    [
      "Students",
      "Names, emails, sessions, averages and recent activity.",
      "/admin/students",
    ],
    [
      "Submissions",
      "Spot-check recent AI-marked short and extended answers.",
      "/admin/submissions",
    ],
    [
      "Questions",
      "Browse the bank with marking guidelines (read-only).",
      "/admin/questions",
    ],
    [
      "AI spend",
      `$${spend.all.toFixed(2)} of $${spend.cap} spent ($${spend.today.toFixed(2)} today).`,
      "/admin/spend",
    ],
  ] as const;
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-4xl font-bold tracking-tight">Admin</h1>
      <div className="mt-8 grid gap-4">
        {cards.map(([title, text, href]) => (
          <Link key={href} className="panel block space-y-2 p-6" href={href}>
            <h2>{title}</h2>
            <p>{text}</p>
          </Link>
        ))}
      </div>
      <dl className="mt-8 grid gap-4 sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="panel p-6">
            <dt className="text-muted-foreground text-sm">{label}</dt>
            <dd className="mt-1 font-serif text-4xl">{value ?? 0}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
