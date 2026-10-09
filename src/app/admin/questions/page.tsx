import { QuestionFile } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import Link from "next/link";
import { loadQuestions, QUESTION_PAGE } from "@/lib/admin-data";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/lib/auth";

export default async function QuestionsBrowser({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const f = await searchParams;
  const page = Math.max(1, Math.floor(Number(f.page)) || 1);
  const [{ questions, total }, topics] = await Promise.all([
    loadQuestions({
      topic: f.topic,
      type: f.type,
      year: f.year,
      q: f.q,
      page,
    }),
    (await createClient())
      .from("topics")
      .select("id,name,parent_id")
      .order("sort"),
  ]);
  const topicName = new Map(
    (topics.data ?? []).map((t) => [t.id, t.name] as const),
  );
  const first = (page - 1) * QUESTION_PAGE;
  const href = (n: number) =>
    `?${new URLSearchParams({
      ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)),
      page: String(n),
    })}`;
  const pager = (
    <nav
      aria-label="Question pages"
      className="text-muted-foreground flex items-center justify-between gap-3 text-sm"
    >
      <span>
        {questions.length
          ? `Showing ${first + 1}–${first + questions.length} of ${total}`
          : `${total} ${total === 1 ? "question" : "questions"}`}
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link
            className={buttonVariants({ variant: "outline", size: "sm" })}
            href={href(page - 1)}
          >
            Previous
          </Link>
        )}
        {first + questions.length < total && (
          <Link
            className={buttonVariants({ variant: "outline", size: "sm" })}
            href={href(page + 1)}
          >
            Next
          </Link>
        )}
      </span>
    </nav>
  );
  return (
    <div className="space-y-4">
      <PageHeader title="Questions" />
      <FilterBar
        values={f}
        filters={[
          {
            name: "topic",
            label: "Topic",
            all: "All",
            options: (topics.data ?? []).map((t) => ({
              value: t.id,
              label: t.name,
            })),
          },
          {
            name: "type",
            label: "Type",
            all: "All",
            options: [
              { value: "mcq", label: "Multiple choice" },
              { value: "short", label: "Short answer" },
              { value: "extended", label: "Extended" },
            ],
          },
          {
            name: "year",
            label: "Year",
            placeholder: "2024",
            inputMode: "numeric",
          },
          { name: "q", label: "Search", placeholder: "Stem or source" },
        ]}
      />
      {pager}
      <ul className="space-y-3">
        {questions.map((q) => (
          <li key={q.id} className="panel space-y-3" id={q.id}>
            <p className="eyebrow">
              {q.source} · {topicName.get(q.topic_id) ?? q.topic_id} · {q.type}{" "}
              · {q.marks} marks
            </p>
            <p className="whitespace-pre-wrap">{q.stem}</p>
            {q.guideline_notes && (
              <div className="bg-peach-soft rounded-xl p-4">
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
      {questions.length > 0 && pager}
      {!questions.length && (
        <EmptyState
          icon={QuestionFile}
          title="No questions match"
          description="Try a different topic, type, year or search."
        />
      )}
    </div>
  );
}
