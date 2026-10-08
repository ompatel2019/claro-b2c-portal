import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { loadSpend } from "@/lib/admin-data";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";

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
  const stats: [string, string | number | null | undefined][] = [
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
    <div className="space-y-4">
      <PageHeader title="Admin" description="Content, students and spend." />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {stats.map(([label, value]) => (
          <StatCard key={label} label={label} value={value ?? 0} />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(([title, text, href]) => (
          <Link
            key={href}
            className="panel hover:border-brand block space-y-1"
            href={href}
          >
            <h2>{title}</h2>
            <p className="text-muted-foreground text-[13px]">{text}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
