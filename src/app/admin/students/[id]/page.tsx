import Link from "next/link";
import { History } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
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
    <div className="space-y-4">
      <Link href="/admin/students" className="text-sm underline">
        Back to students
      </Link>
      <PageHeader title={profile.full_name || "Student"} />
      <dl className="panel grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground text-[13px]">Email</dt>
          <dd className="break-all">{email || "No email"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[13px]">Joined</dt>
          <dd>{dateLabel(profile.created_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[13px]">Year</dt>
          <dd>{profile.year_level ?? "Not set"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[13px]">School</dt>
          <dd>{profile.school || "Not set"}</dd>
        </div>
      </dl>
      <h2>Recent sessions</h2>
      {!sessions.length ? (
        <EmptyState
          icon={History}
          title="No sessions yet"
          description="This student hasn't started a session."
        />
      ) : (
        <ul className="panel divide-y divide-dashed py-0">
          {sessions.map((s) => {
            const href =
              s.kind === "flashcards"
                ? `/student/flashcards/${s.id}`
                : `/student/sprint/${s.id}${s.finished_at ? "/results" : ""}`;
            const cfg =
              s.config &&
              typeof s.config === "object" &&
              !Array.isArray(s.config)
                ? (s.config as { mode?: string })
                : {};
            const label =
              s.kind === "flashcards"
                ? `Flashcards: ${String(cfg.mode ?? "study")}`
                : modeLabel(cfg.mode);
            return (
              <li key={s.id}>
                <Link
                  className="hover:bg-surface -mx-5 block px-5 py-3"
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
    </div>
  );
}
