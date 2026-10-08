import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import {
  sydneyToday,
  type Flashcard,
  type FlashcardProgress,
} from "@/lib/flashcards";
import { dateLabel, plural, type Topic } from "@/lib/practice";
import { FlashcardStart } from "@/components/flashcard-start";
import { PageHeader } from "@/components/page-header";
export default async function Flashcards({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; filter?: string }>;
}) {
  const profile = await requireProfile();
  const filters = await searchParams;
  const db = await createClient();
  const [topicResult, cardResult, progressResult, unfinished] =
    await Promise.all([
      db
        .from("topics")
        .select("id,parent_id,name,sort")
        .order("sort")
        .throwOnError(),
      db
        .from("flashcards")
        .select("id,topic_id,kind,front,back")
        .throwOnError(),
      db
        .from("flashcard_progress")
        .select("*")
        .eq("user_id", profile.id)
        .throwOnError(),
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
  const topics = (topicResult.data ?? []) as Topic[];
  const cards = (cardResult.data ?? []) as Flashcard[];
  const progress = (progressResult.data ?? []) as FlashcardProgress[];
  const today = sydneyToday();
  const due = progress.filter((p) => p.due_on <= today).length;
  const next = progress
    .filter((p) => p.due_on > today)
    .map((p) => p.due_on)
    .sort()[0];
  const selected = topics.find((t) => t.id === filters.topic);
  const parent = filters.filter ?? selected?.parent_id ?? selected?.id ?? "";
  const decks = topics.filter(
    (t) => !parent || t.id === parent || t.parent_id === parent,
  );
  const pill =
    "inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium";
  const active = "border-ink bg-ink text-white";
  const idle = "bg-white";
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="A little recall, a stronger foundation"
        title="Your flashcards."
      />
      <section className="panel space-y-3">
        <h2>Due for review today: {plural(due, "card")}</h2>
        {due ? (
          <>
            <p>Review up to 20 cards in a focused study session.</p>
            <FlashcardStart due label={`Review ${plural(due, "card")}`} />
          </>
        ) : (
          <p>
            {next
              ? `Nothing due. Your next cards are due ${dateLabel(next)}.`
              : "Nothing due. Start a deck below"}
          </p>
        )}
      </section>
      {unfinished.data?.[0] && (
        <Link
          className="button-link"
          href={`/flashcards/${unfinished.data[0].id}`}
        >
          Continue your flashcards
        </Link>
      )}
      <section className="panel space-y-3" id="start-deck">
        <p className="eyebrow">Selected deck</p>
        <h2>{selected?.name ?? "All topics"}</h2>
        <p>
          Up to 20 cards. Missed and Mostly cards come back for another try.
        </p>
        <FlashcardStart
          key={selected?.id ?? "all"}
          topic={selected?.id}
          settings
        />
      </section>
      <section className="space-y-3">
        <h2>Choose a deck</h2>
        <nav
          aria-label="Filter flashcard topics"
          className="flex flex-wrap gap-2"
        >
          <Link
            className={`${pill} ${!parent ? active : idle}`}
            href="/flashcards?filter="
            aria-current={!parent ? "page" : undefined}
          >
            All
          </Link>
          {topics
            .filter((t) => !t.parent_id)
            .map((t) => (
              <Link
                key={t.id}
                className={`${pill} ${parent === t.id ? active : idle}`}
                href={`/flashcards?filter=${t.id}&topic=${t.id}`}
                aria-current={parent === t.id ? "page" : undefined}
              >
                {t.name}
              </Link>
            ))}
        </nav>
        <ul className="grid gap-3 sm:grid-cols-2">
          {decks.map((t) => {
            const deck = cards.filter((c) =>
              t.parent_id
                ? c.topic_id === t.id
                : c.topic_id.startsWith(`${t.id}-`),
            );
            const known = deck.filter((c) =>
              progress.some(
                (p) => p.flashcard_id === c.id && Number(p.last_mark) === 1,
              ),
            ).length;
            const mastery = deck.length
              ? Math.round((known / deck.length) * 100)
              : 0;
            return (
              <li key={t.id}>
                <Link
                  className={`panel hover:border-brand block h-full space-y-2 ${selected?.id === t.id ? "border-brand bg-peach-soft" : ""}`}
                  href={`/flashcards?topic=${t.id}&filter=${parent}#start-deck`}
                  aria-current={selected?.id === t.id ? "true" : undefined}
                >
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-sm">
                    {plural(
                      deck.filter((c) => c.kind === "term").length,
                      "term",
                    )}{" "}
                    ·{" "}
                    {plural(
                      deck.filter((c) => c.kind === "stat").length,
                      "statistics card",
                    )}
                  </p>
                  <p className="text-sm">{mastery}% mastery</p>
                  <div
                    role="progressbar"
                    aria-label={`${t.name} mastery`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={mastery}
                    className="bg-paper h-2 overflow-hidden rounded-full"
                  >
                    <div
                      className="bg-brand h-full"
                      style={{ width: `${mastery}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold underline">
                    Choose this deck
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
