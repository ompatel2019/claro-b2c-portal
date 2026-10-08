import Link from "next/link";
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
    <main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
      <h1>Submissions</h1>
      <p>Recent AI-marked short and extended answers for spot checks.</p>
      {!rows.length ? (
        <p className="panel p-6">No marked written answers yet.</p>
      ) : (
        <ul className="space-y-4">
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
              <li key={a.id} className="panel space-y-3 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="font-semibold">
                    {nameOf.get(a.user_id) || "Student"} · {q?.source}
                  </p>
                  <p className="chip">
                    {a.mark}/{a.max_marks ?? q?.marks} · {a.band}
                  </p>
                </div>
                <p className="text-sm">{dateLabel(a.updated_at)}</p>
                <p className="line-clamp-3">{q?.stem}</p>
                <Link
                  className="button-link"
                  href={`/practice/${a.session_id}/results`}
                >
                  Open full feedback
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
