import Link from "next/link";
import { Pen } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { loadSubmissions } from "@/lib/admin-data";
import { createClient } from "@/utils/supabase/server";
import { dateLabel } from "@/lib/practice";

export default async function SubmissionsPage() {
  const rows = await loadSubmissions();
  const db = await createClient();
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: names } = ids.length
    ? await db.from("profiles").select("id,full_name").in("id", ids)
    : { data: [] };
  const nameOf = new Map((names ?? []).map((p) => [p.id, p.full_name]));
  return (
    <div className="space-y-4">
      <PageHeader
        title="Submissions"
        description="Recent AI-marked short and extended answers for spot checks."
      />
      {!rows.length ? (
        <EmptyState
          icon={Pen}
          title="No submissions yet"
          description="Marked short and extended answers appear here."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => {
            const raw = a.question as
              | {
                  type: string;
                  stem: string;
                  source: string;
                  marks: number;
                }
              | {
                  type: string;
                  stem: string;
                  source: string;
                  marks: number;
                }[]
              | null;
            const q = Array.isArray(raw) ? (raw[0] ?? null) : raw;
            return (
              <li key={a.id} className="panel space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="font-semibold">
                    {nameOf.get(a.user_id) || "Student"} · {q?.source}
                  </p>
                  <Badge variant="secondary">
                    {a.mark}/{a.max_marks ?? q?.marks}
                    {a.band ? ` · ${a.band}` : ""}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-[13px]">
                  {dateLabel(a.marked_at ?? a.created_at)}
                </p>
                <p className="line-clamp-3">{q?.stem}</p>
                <Link
                  className="button-link"
                  href={`/student/sprint/${a.session_id}/results`}
                >
                  Open full feedback
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
