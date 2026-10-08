import { redirect } from "next/navigation";
import { loadHomework } from "@/lib/homework-data";
import { cardIds, stageOneComplete } from "@/lib/homework";
import { answered } from "@/lib/practice";
import { FlashcardRunner } from "@/components/flashcard-runner";
import { SprintRunner } from "@/components/sprint-runner";
import type { Flashcard } from "@/lib/flashcards";
export default async function Run({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { set, session, profile } = await loadHomework((await params).setId);
  if (!session) redirect(`/homework/${set.id}`);
  if (session.finished_at) redirect(`/practice/${session.id}/results`);
  const ids = cardIds(set);
  const reviews = session.reviews ?? [];
  const attempts = session.attempts ?? [];
  if (!stageOneComplete(ids, reviews))
    return (
      <FlashcardRunner
        key={session.id}
        session={{
          ...session,
          kind: "flashcards",
          config: {
            mode: "study",
            card_ids: ids,
            topics: set.topic_id ? [set.topic_id] : [],
            kinds: ["term", "stat"],
            due: false,
          },
        }}
        cards={set.items.flatMap((i) => (i.card ? [i.card as Flashcard] : []))}
        reviews={reviews}
        deckName={set.title}
        homework={{
          setId: set.id,
          answered: attempts.filter(answered).length,
          questions: attempts.length,
        }}
      />
    );
  return (
    <SprintRunner
      session={{
        ...session,
        config: {
          mode: "mixed",
          topics: set.topic_id ? [set.topic_id] : [],
          target_marks: 0,
          time_limit_min: 0,
        },
      }}
      initial={attempts}
      userId={profile.id}
      homework={{
        setId: set.id,
        title: set.title,
        cards: ids.length,
        retries: reviews.filter(
          (r) => ids.includes(r.flashcard_id) && r.mark < 1,
        ).length,
      }}
    />
  );
}
