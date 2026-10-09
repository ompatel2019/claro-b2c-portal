import { redirect } from "next/navigation";
import { loadFlashcards } from "@/lib/flashcard-data";
import { topicNames } from "@/lib/practice";
import { FlashcardRunner } from "@/components/flashcard-runner";
export default async function FlashcardSession({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, cards, reviews, topics } = await loadFlashcards(id);
  if (session.finished_at) redirect(`/flashcards/${id}/results`);
  return (
    <FlashcardRunner
      session={session}
      cards={cards}
      reviews={reviews}
      deckName={
        session.config.which === "due" || session.config.due
          ? "Due for review"
          : topicNames(
              session.config.subtopics?.length
                ? session.config.subtopics
                : session.config.topics,
              topics,
            )
      }
    />
  );
}
