import Link from "next/link";
import { redirect } from "next/navigation";
import { loadFlashcards } from "@/lib/flashcard-data";
import { firstReviews, type FlashcardProgress } from "@/lib/flashcards";
import { createClient } from "@/utils/supabase/server";
import { dateLabel, timer, topicNames } from "@/lib/practice";
import { FlashcardStart } from "@/components/flashcard-start";
import { Cards } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
export default async function Results({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, cards, reviews, topics, profile } = await loadFlashcards(id);
  if (!session.finished_at) redirect(`/flashcards/${id}`);
  const first = firstReviews(reviews);
  const rows = session.config.card_ids.flatMap((cardId) => {
    const card = cards.find((c) => c.id === cardId);
    const review = first.get(cardId);
    return card && review
      ? [
          {
            card,
            review,
            attempts: reviews.filter((r) => r.flashcard_id === cardId),
          },
        ]
      : [];
  });
  const missed = rows.filter((r) => r.review.mark < 1);
  const known = rows.filter((r) => r.review.mark === 1);
  const db = await createClient();
  const { data } = await db
    .from("flashcard_progress")
    .select("flashcard_id,due_on")
    .eq("user_id", profile.id)
    .in("flashcard_id", [...first.keys()])
    .throwOnError();
  const progress = (data ?? []) as Pick<
    FlashcardProgress,
    "flashcard_id" | "due_on"
  >[];
  const nextDue = progress.map((p) => p.due_on).sort()[0];
  const score = rows.reduce((sum, r) => sum + Number(r.review.mark), 0);
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${topicNames(session.config.subtopics?.length ? session.config.subtopics : session.config.topics, topics)} · Flashcards: ${session.config.mode === "study" ? "Study" : "Test"}`}
        title="Your flashcard results."
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Score"
          value={`${score}/${rows.length}`}
          caption="First-try marks / cards reviewed"
        />
        <StatCard label="Knew first time" value={known.length} />
        <StatCard label="Needed retries" value={missed.length} />
        <StatCard label="Time" value={timer(session.elapsed_s ?? 0)} />
      </div>
      <section className="panel space-y-3">
        <h2>Your next step</h2>
        <div>
          <h3 className="font-semibold">Strengths</h3>
          <p>
            {known.length
              ? `Known first time: ${known.map((r) => r.card.front).join(", ")}.`
              : "Keep practising recall to build your first-time confidence."}
          </p>
        </div>
        <div>
          <h3 className="font-semibold">Priority</h3>
          <p>
            {missed.length
              ? `Revisit ${missed.map((r) => r.card.front).join(", ")}.`
              : rows.length
                ? "You knew every reviewed card first time. Try another deck."
                : "Start a deck and review a card to build your score."}
          </p>
        </div>
        <div>
          <h3 className="font-semibold">Next move</h3>
          <p>
            {nextDue
              ? `Your next review is due ${dateLabel(nextDue)}. Each card's date is below.`
              : "Choose a deck to start your review schedule."}
          </p>
        </div>
      </section>
      <div className="flex flex-wrap items-start gap-3">
        {missed.length > 0 && (
          <FlashcardStart
            cardIds={missed.map((r) => r.card.id)}
            label="Practise missed cards again"
          />
        )}
        <Link className="button-link" href="/student/flashcards">
          Back to flashcards
        </Link>
      </div>
      <section className="space-y-3">
        <h2>Your cards</h2>
        {rows.length ? (
          <ul className="space-y-3">
            {rows.map(({ card, review, attempts }) => {
              const reason = attempts.find((r) => r.reason)?.reason;
              const due = progress.find(
                (p) => p.flashcard_id === card.id,
              )?.due_on;
              return (
                <li key={card.id} className="panel space-y-2">
                  <h3 className="font-semibold break-words">{card.front}</h3>
                  <p className="whitespace-pre-wrap">{card.back}</p>
                  <p className="chip">
                    First mark: {review.mark}/1 · {attempts.length}{" "}
                    {attempts.length === 1 ? "attempt" : "attempts"}
                  </p>
                  {reason && <p>AI feedback: {reason}</p>}
                  {due && <p className="text-sm">Next due: {dateLabel(due)}</p>}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={Cards}
            title="No cards reviewed"
            description="No cards were reviewed in this session."
          />
        )}
      </section>
    </div>
  );
}
