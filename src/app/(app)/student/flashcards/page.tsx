import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { sydneyToday } from "@/lib/flashcards";
import { DECK_DEFAULTS, filterDeck } from "@/lib/deck";
import { loadDeckBank } from "@/lib/flashcard-data";
import { dateLabel, plural, type Topic } from "@/lib/practice";
import { FlashcardStart } from "@/components/flashcard-start";
import { FlashcardBuilder } from "@/components/flashcard-builder";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { addDays } from "@/lib/activity";
import { Card, CardContent } from "@/components/ui/card";

export default async function Flashcards({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const profile = await requireProfile();
  const params = await searchParams;
  const db = await createClient();
  const [topicResult, bank, unfinished] = await Promise.all([
    db
      .from("topics")
      .select("id,parent_id,name,sort")
      .order("sort")
      .throwOnError(),
    loadDeckBank(db, profile.id),
    db
      .from("sessions")
      .select("id,config")
      .eq("user_id", profile.id)
      .eq("kind", "flashcards")
      .is("finished_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .throwOnError(),
  ]);
  const { cards, progress } = bank;
  const today = sydneyToday();
  const tomorrow = addDays(today, 1);
  const history = { progress, today, userId: profile.id };
  const due = filterDeck(
    cards,
    { ...DECK_DEFAULTS, which: "due" },
    history,
  ).length;
  const ids = new Set(cards.map((c) => c.id));
  const activeProgress = progress.filter((p) => ids.has(p.flashcard_id));
  const tomorrowCount = activeProgress.filter(
    (p) => p.due_on === tomorrow,
  ).length;
  const next = activeProgress
    .filter((p) => p.due_on > today)
    .map((p) => p.due_on)
    .sort()[0];
  const open = unfinished.data?.[0];
  const openIds: string[] = open?.config.card_ids ?? [];
  const sessionReviews = open
    ? await db
        .from("flashcard_reviews")
        .select("flashcard_id")
        .eq("user_id", profile.id)
        .eq("session_id", open.id)
        .throwOnError()
    : null;
  const reviewed = new Set(
    (sessionReviews?.data ?? [])
      .filter((r) => openIds.includes(r.flashcard_id))
      .map((r) => r.flashcard_id),
  ).size;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Flashcards"
        description="Build the exact deck you want to drill."
      />
      <Card className="mx-auto max-w-[720px]">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p>
            {due
              ? `${plural(due, "card")} due today · ${tomorrowCount} tomorrow`
              : next
                ? `Nothing due. Next review ${dateLabel(next, true)}.`
                : "Nothing due. Start a deck below."}
          </p>
          {due > 0 && <FlashcardStart due label="Review due" />}
        </CardContent>
      </Card>
      {open && (
        <Card className="mx-auto max-w-[720px]">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p>
              You have an unfinished flashcards session · {reviewed}/
              {openIds.length} reviewed
            </p>
            <Link
              className={buttonVariants({ size: "sm" })}
              href={`/student/flashcards/${open.id}`}
            >
              Continue
            </Link>
          </CardContent>
        </Card>
      )}
      <FlashcardBuilder
        cards={cards}
        topics={(topicResult.data ?? []) as Topic[]}
        history={history}
        topic={params.topic}
      />
    </div>
  );
}
