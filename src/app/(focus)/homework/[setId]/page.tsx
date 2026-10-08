import Link from "next/link";
import { loadHomework } from "@/lib/homework-data";
import { homeworkCounts, estimateMinutes, dueLabel } from "@/lib/homework";
import { beginHomework } from "@/app/(app)/homework/actions";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
export default async function Welcome({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { set, session } = await loadHomework((await params).setId);
  const c = homeworkCounts(set.items);
  return (
    <main className="mx-auto min-h-screen max-w-5xl space-y-8 px-5 py-8 sm:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Logo />
        <Link href="/homework" className="underline">
          Back to Homework
        </Link>
      </header>
      <div className="space-y-4 py-6">
        <p className="eyebrow">{set.topic?.name ?? "Economics"}</p>
        <h1>
          Welcome to <em>{set.title}</em>
        </h1>
        <p>A focused session to practise, answer and learn.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          [
            "01",
            "Flashcards",
            `${c.cards} key terms. Get every card right to move on.`,
          ],
          [
            "02",
            "Questions",
            `${c.mc} multiple choice and ${c.written} short answers. ${c.marks} marks. Type or upload a photo.`,
          ],
          [
            "03",
            "Feedback",
            "Submit to get AI marking with band, comments and a better-answer outline.",
          ],
        ].map(([n, title, text]) => (
          <section className="panel space-y-4 p-6" key={n}>
            <p className="eyebrow">{n}</p>
            <h2>{title}</h2>
            <p>{text}</p>
          </section>
        ))}
      </div>
      <p className="chip">
        About {estimateMinutes(set.items)} min | Due {dueLabel(set.due_at)} |
        Saves as you go
      </p>
      {session?.finished_at ? (
        <Link className="button-link" href={`/practice/${session.id}/results`}>
          View results
        </Link>
      ) : (
        <form action={beginHomework}>
          <input type="hidden" name="setId" value={set.id} />
          <Button type="submit">
            {session ? "Continue" : "Begin homework"}
          </Button>
        </form>
      )}
    </main>
  );
}
