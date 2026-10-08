import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { homeworkColumns } from "@/lib/homework-data";
import type { HomeworkSet } from "@/lib/homework";
import { questionColumns, type Topic, type Attempt } from "@/lib/practice";
import type { Flashcard } from "@/lib/flashcards";
import { HomeworkBuilder } from "@/components/homework-builder";
import { Button } from "@/components/ui/button";
export default async function EditHomework({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const f = await searchParams;
  const db = await createClient();
  const [setResult, topics, started] = await Promise.all([
    db
      .from("homework_sets")
      .select(homeworkColumns)
      .eq("id", id)
      .maybeSingle()
      .throwOnError(),
    db.from("topics").select("*").order("sort").throwOnError(),
    db
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("homework_set_id", id)
      .throwOnError(),
  ]);
  if (!setResult.data) notFound();
  const set = setResult.data as unknown as HomeworkSet;
  set.items.sort((a, b) => a.position - b.position);
  let cardsQuery = db
    .from("flashcards")
    .select("id,topic_id,kind,front,back")
    .order("front");
  let questionsQuery = db
    .from("questions")
    .select(questionColumns)
    .order("year", { ascending: false })
    .order("id");
  if (f.cardTopic)
    cardsQuery = f.cardTopic.includes("-")
      ? cardsQuery.eq("topic_id", f.cardTopic)
      : cardsQuery.like("topic_id", `${f.cardTopic}-%`);
  if (f.questionTopic)
    questionsQuery = f.questionTopic.includes("-")
      ? questionsQuery.eq("topic_id", f.questionTopic)
      : questionsQuery.like("topic_id", `${f.questionTopic}-%`);
  if (["term", "stat"].includes(f.cardType ?? ""))
    cardsQuery = cardsQuery.eq("kind", f.cardType!);
  if (["mcq", "short", "extended"].includes(f.questionType ?? ""))
    questionsQuery = questionsQuery.eq("type", f.questionType!);
  if (f.year && /^\d{4}$/.test(f.year))
    questionsQuery = questionsQuery.eq("year", Number(f.year));
  if (f.cardSearch)
    cardsQuery = cardsQuery.ilike("front", `%${f.cardSearch.slice(0, 200)}%`);
  if (f.questionSearch)
    questionsQuery = questionsQuery.ilike(
      "stem",
      `%${f.questionSearch.slice(0, 200)}%`,
    );
  const [cards, questions] = await Promise.all([
    cardsQuery.limit(200).throwOnError(),
    questionsQuery.limit(200).throwOnError(),
  ]);
  const allCards = [
    ...new Map(
      [
        ...set.items.flatMap((i) => (i.card ? [i.card] : [])),
        ...(cards.data ?? []),
      ].map((c) => [c.id, c]),
    ).values(),
  ] as Flashcard[];
  const allQuestions = [
    ...new Map(
      [
        ...set.items.flatMap((i) => (i.question ? [i.question] : [])),
        ...(questions.data ?? []),
      ].map((q) => [q.id, q]),
    ).values(),
  ] as Attempt["question"][];
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-8">
      <Link href="/admin/homework" className="underline">
        Back to homework sets
      </Link>
      <h1>Edit homework</h1>
      {f.saved && <p role="status">Homework saved.</p>}
      <form method="get" className="panel space-y-5 p-5">
        <h2>Filter the library</h2>
        <p className="text-sm">
          Save your selection before changing filters. Selected items stay
          visible. Each picker shows up to 200 matches.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          {["card", "question"].map((prefix) => (
            <fieldset className="min-w-0 space-y-3" key={prefix}>
              <legend className="font-semibold">
                {prefix === "card" ? "Flashcards" : "Questions"}
              </legend>
              <label className="grid gap-2">
                Topic or subtopic
                <select
                  className="field max-w-full"
                  name={`${prefix}Topic`}
                  defaultValue={f[`${prefix}Topic`] ?? ""}
                >
                  <option value="">All topics</option>
                  {topics.data?.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                Type
                <select
                  className="field"
                  name={`${prefix}Type`}
                  defaultValue={f[`${prefix}Type`] ?? ""}
                >
                  <option value="">All types</option>
                  {(prefix === "card"
                    ? [
                        ["term", "Term"],
                        ["stat", "Statistic"],
                      ]
                    : [
                        ["mcq", "Multiple choice"],
                        ["short", "Short answer"],
                        ["extended", "Extended response"],
                      ]
                  ).map(([v, label]) => (
                    <option value={v} key={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                Search {prefix === "card" ? "flashcards" : "questions"}
                <input
                  className="field"
                  name={`${prefix}Search`}
                  defaultValue={f[`${prefix}Search`]}
                  maxLength={200}
                />
              </label>
              {prefix === "question" && (
                <label className="grid gap-2">
                  Year
                  <input
                    className="field"
                    type="number"
                    name="year"
                    min={2000}
                    max={2100}
                    defaultValue={f.year}
                  />
                </label>
              )}
            </fieldset>
          ))}
        </div>
        <Button type="submit">Apply filters</Button>
      </form>
      <HomeworkBuilder
        key={`${id}:${JSON.stringify(f)}`}
        set={set}
        topics={topics.data as Topic[]}
        cards={allCards}
        questions={allQuestions}
        started={started.count ?? 0}
      />
    </main>
  );
}
