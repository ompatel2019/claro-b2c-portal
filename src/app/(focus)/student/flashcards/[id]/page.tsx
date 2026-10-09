import Link from "next/link";
import { loadFlashcards, pages } from "@/lib/flashcard-data";
import {
  firstReviews,
  type FlashcardProgress,
  type FlashcardReview,
} from "@/lib/flashcards";
import { createClient } from "@/utils/supabase/server";
import { dateLabel, timer, topicNames } from "@/lib/practice";
import { FlashcardRunner } from "@/components/flashcard-runner";
import { FlashcardStart } from "@/components/flashcard-start";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Check, Minus, Close } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export default async function FlashcardSession({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, cards, reviews, topics, profile } = await loadFlashcards(id);
  const deckName =
    session.config.which === "due" || session.config.due
      ? "Due for review"
      : topicNames(
          session.config.subtopics?.length
            ? session.config.subtopics
            : session.config.topics,
          topics,
        );
  if (!session.finished_at)
    return (
      <FlashcardRunner
        session={session}
        cards={cards}
        reviews={reviews}
        topics={topics}
        deckName={deckName}
      />
    );
  const first = firstReviews(reviews);
  const rows = session.config.card_ids.flatMap((cardId) => {
    const card = cards.find((c) => c.id === cardId);
    return card ? [{ card, review: first.get(cardId) }] : [];
  });
  const missed = rows.filter((r) => r.review && r.review.mark < 1);
  const counts = [1, 0.5, 0].map(
    (mark) => rows.filter((r) => r.review?.mark === mark).length,
  );
  const db = await createClient();
  const [progressResult, history] = await Promise.all([
    db
      .from("flashcard_progress")
      .select("flashcard_id,due_on")
      .eq("user_id", profile.id)
      .in("flashcard_id", session.config.card_ids)
      .throwOnError(),
    pages<Pick<FlashcardReview, "flashcard_id" | "mark">>((from, to) =>
      db
        .from("flashcard_reviews")
        .select("flashcard_id,mark")
        .eq("user_id", profile.id)
        .in("flashcard_id", session.config.card_ids)
        .order("id")
        .range(from, to),
    ),
  ]);
  const progress = (progressResult.data ?? []) as Pick<
    FlashcardProgress,
    "flashcard_id" | "due_on"
  >[];
  return (
    <main id="main" className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <PageHeader
        eyebrow={`${deckName} · ${session.config.mode === "study" ? "Study" : "Test"}`}
        title="Your flashcard results"
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="First-try score"
          value={
            first.size
              ? `${counts[0]} / ${session.config.card_ids.length}`
              : "No score yet"
          }
        />
        <StatCard label="Knew / Mostly / Missed" value={counts.join(" / ")} />
        <StatCard label="Time" value={timer(session.elapsed_s ?? 0)} />
        <StatCard
          label="Repeats"
          value={Math.max(0, reviews.length - first.size)}
        />
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <FlashcardStart
          cardIds={missed.map((r) => r.card.id)}
          label={`Practise missed (${missed.length})`}
          disabled={!missed.length}
        />
        {session.config.mode === "study" && (
          <FlashcardStart
            cardIds={session.config.card_ids}
            mode="test"
            label="Test these cards"
            variant="outline"
          />
        )}
        <FlashcardStart due label="Review due" variant="outline" />
        <Button variant="outline" render={<Link href="/student/flashcards" />}>
          Back to flashcards
        </Button>
      </div>
      <Card className="p-5">
        <h2 id="your-cards">Your cards</h2>
        <Table aria-labelledby="your-cards">
          <TableHeader>
            <TableRow>
              {[
                "Card",
                "Your answer",
                "Result",
                "Reason",
                "Model answer",
                "All-time",
                "Next due",
              ].map((label) => (
                <TableHead
                  key={label}
                  className={
                    label === "Reason" || label === "All-time"
                      ? "hidden sm:table-cell"
                      : undefined
                  }
                >
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ card, review }) => {
              const all = history.filter((r) => r.flashcard_id === card.id);
              const due = progress.find(
                (p) => p.flashcard_id === card.id,
              )?.due_on;
              const Icon =
                review?.mark === 1
                  ? Check
                  : review?.mark === 0.5
                    ? Minus
                    : Close;
              return (
                <TableRow key={card.id}>
                  <TableCell>{card.front}</TableCell>
                  <TableCell className="whitespace-pre-wrap">
                    {review?.answer || "Not answered"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        !review
                          ? "outline"
                          : review.mark === 1
                            ? "success"
                            : review.mark === 0.5
                              ? "warning"
                              : "destructive"
                      }
                    >
                      <Icon />
                      {!review
                        ? "Not rated"
                        : review.mark === 1
                          ? "Knew it"
                          : review.mark === 0.5
                            ? "Mostly"
                            : "Missed"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {review?.reason || (review ? "Self-rated" : "Skipped")}
                  </TableCell>
                  <TableCell className="whitespace-pre-wrap">
                    {card.back}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    Seen {all.length}× ·{" "}
                    {all.length
                      ? Math.round(
                          (all.reduce((sum, r) => sum + r.mark, 0) /
                            all.length) *
                            100,
                        )
                      : 0}
                    % all-time
                  </TableCell>
                  <TableCell>{due ? dateLabel(due) : "Due now"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </main>
  );
}
