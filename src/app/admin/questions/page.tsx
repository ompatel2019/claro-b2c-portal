import Link from "next/link";
import { loadQuestions } from "@/lib/admin-data";
import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/lib/auth";

export default async function QuestionsBrowser({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const f = await searchParams;
  const [questions, topics] = await Promise.all([
    loadQuestions({
      topic: f.topic,
      type: f.type,
      year: f.year,
      q: f.q,
    }),
    (await createClient())
      .from("topics")
      .select("id,name,parent_id")
      .order("sort"),
  ]);
  const topicName = new Map(
    (topics.data ?? []).map((t) => [t.id, t.name] as const),
  );
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
      <h1>Questions</h1>
      <form method="get" className="panel grid gap-4 p-5 sm:grid-cols-4">
        <label className="grid gap-2">
          Topic
          <select className="field" name="topic" defaultValue={f.topic ?? ""}>
            <option value="">All</option>
            {(topics.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          Type
          <select className="field" name="type" defaultValue={f.type ?? ""}>
            <option value="">All</option>
            <option value="mcq">Multiple choice</option>
            <option value="short">Short answer</option>
            <option value="extended">Extended</option>
          </select>
        </label>
        <label className="grid gap-2">
          Year
          <input
            className="field"
            name="year"
            inputMode="numeric"
            placeholder="2024"
            defaultValue={f.year ?? ""}
          />
        </label>
        <label className="grid gap-2">
          Search
          <input
            className="field"
            name="q"
            defaultValue={f.q ?? ""}
            placeholder="Stem or source"
          />
        </label>
        <button className="button-link sm:col-span-4" type="submit">
          Apply filters
        </button>
      </form>
      <p>{questions.length} shown (max 100)</p>
      <ul className="space-y-4">
        {questions.map((q) => (
          <li key={q.id} className="panel space-y-3 p-5" id={q.id}>
            <p className="eyebrow">
              {q.source} · {topicName.get(q.topic_id) ?? q.topic_id} · {q.type}{" "}
              · {q.marks} marks
            </p>
            <p className="whitespace-pre-wrap">{q.stem}</p>
            {q.guideline_notes && (
              <div className="bg-peach-soft rounded-2xl p-4">
                <h3 className="font-semibold">Marking guideline</h3>
                <p className="mt-2 text-sm whitespace-pre-wrap">
                  {q.guideline_notes}
                </p>
              </div>
            )}
            {Array.isArray(q.criteria) && q.criteria.length > 0 && (
              <div>
                <h3 className="font-semibold">Criteria</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {(
                    q.criteria as {
                      min?: number;
                      max?: number;
                      descriptor?: string;
                    }[]
                  ).map((c, i) => (
                    <li key={i}>
                      {c.min}-{c.max}: {c.descriptor}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!questions.length && <p className="panel p-6">No questions match.</p>}
      <Link href="/admin" className="underline">
        Back to admin
      </Link>
    </main>
  );
}
