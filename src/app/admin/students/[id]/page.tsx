import Link from "next/link";
import { notFound } from "next/navigation";
import { loadStudent } from "@/lib/admin-data";
import { dateLabel, modeLabel, percentage } from "@/lib/practice";

export default async function StudentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadStudent(id);
  if (!data) notFound();
  const { profile, email, sessions } = data;
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-5 py-8">
      <Link href="/admin/students" className="underline">
        Back to students
      </Link>
      <h1>{profile.full_name || "Student"}</h1>
      <dl className="panel grid gap-3 p-6 sm:grid-cols-2">
        <div>
          <dt className="text-sm">Email</dt>
          <dd className="break-all">{email || "—"}</dd>
        </div>
        <div>
          <dt className="text-sm">Joined</dt>
          <dd>{dateLabel(profile.created_at)}</dd>
        </div>
        <div>
          <dt className="text-sm">Year</dt>
          <dd>{profile.year_level ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-sm">School</dt>
          <dd>{profile.school || "—"}</dd>
        </div>
      </dl>
      <h2>Recent sessions</h2>
      {!sessions.length ? (
        <p className="panel p-6">No sessions yet.</p>
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => {
            const href =
              s.kind === "flashcards"
                ? `/flashcards/${s.id}${s.finished_at ? "/results" : ""}`
                : s.kind === "homework"
                  ? s.finished_at
                    ? `/practice/${s.id}/results`
                    : `/homework/${s.homework_set_id}`
                  : `/practice/${s.id}${s.finished_at ? "/results" : ""}`;
            const cfg =
              s.config &&
              typeof s.config === "object" &&
              !Array.isArray(s.config)
                ? (s.config as { mode?: string })
                : {};
            const label =
              s.kind === "flashcards"
                ? `Flashcards: ${String(cfg.mode ?? "study")}`
                : s.kind === "homework"
                  ? "Homework"
                  : modeLabel(cfg.mode);
            return (
              <li key={s.id}>
                <Link
                  className="panel hover:border-brand block p-5"
                  href={href}
                >
                  <p className="font-semibold">{label}</p>
                  <p className="mt-1 text-sm">
                    {dateLabel(s.finished_at ?? s.started_at)} ·{" "}
                    {s.finished_at
                      ? percentage(s.score, s.max_score)
                      : "In progress"}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
