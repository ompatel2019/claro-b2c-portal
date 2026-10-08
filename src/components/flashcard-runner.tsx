"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { ensureSession } from "@/lib/auth-client";
import {
  rateFlashcard,
  saveFlashcardTime,
} from "@/app/(app)/flashcards/actions";
import {
  nextQueue,
  resumeQueue,
  type Flashcard,
  type FlashcardMark,
  type FlashcardReview,
} from "@/lib/flashcards";
import type { FlashcardSession } from "@/lib/flashcard-data";
import { Button } from "./ui/button";
import { Logo } from "./logo";
export function FlashcardRunner({
  session,
  cards,
  reviews,
  deckName,
}: {
  session: FlashcardSession;
  cards: Flashcard[];
  reviews: FlashcardReview[];
  deckName: string;
}) {
  const router = useRouter();
  const [db] = useState(createClient);
  const [queue, setQueue] = useState(() =>
    resumeQueue(session.config.card_ids, reviews),
  );
  const [marks, setMarks] = useState(
    () => new Map(reviews.map((r) => [r.flashcard_id, r.mark])),
  );
  const [flipped, setFlipped] = useState(false);
  const [answer, setAnswer] = useState("");
  const [verdict, setVerdict] = useState<{
    mark: FlashcardMark;
    reason: string;
    back: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  const lock = useRef(false);
  const started = useRef(0);
  useEffect(() => {
    started.current = Date.now();
  }, []);
  const heading = useRef<HTMLHeadingElement>(null);
  const card = cards.find((c) => c.id === queue[0]);
  const recycled = queue.filter(
    (id) => marks.has(id) && marks.get(id) !== 1,
  ).length;
  const done = session.config.card_ids.filter(
    (id) => marks.get(id) === 1,
  ).length;
  useEffect(() => {
    heading.current?.focus();
  }, [card?.id]);
  function act(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setError("");
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Could not save your review. Please try again.",
        );
      } finally {
        lock.current = false;
      }
    });
  }
  const saveTime = useCallback(async () => {
    await saveFlashcardTime(
      session.id,
      (session.elapsed_s ?? 0) +
        Math.floor((Date.now() - started.current) / 1000),
    );
  }, [session.id, session.elapsed_s]);
  async function post(url: string, body?: object) {
    await ensureSession(db);
    const send = () =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body && JSON.stringify(body),
      });
    let response = await send();
    if (response.status === 401) {
      await ensureSession(db);
      response = await send();
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        result.error ?? "Something went wrong. Please try again.",
      );
    return result;
  }
  async function finish() {
    await saveTime();
    await post(`/api/sessions/${session.id}/finish`);
    window.location.assign(`/flashcards/${session.id}/results`);
  }
  async function advance(mark: FlashcardMark) {
    if (!card) return;
    const next = nextQueue(queue, card.id, mark);
    setMarks((prev) => new Map(prev).set(card.id, mark));
    setQueue(next);
    setFlipped(false);
    setAnswer("");
    setVerdict(null);
    if (!next.length) await finish();
  }
  async function rate(mark: FlashcardMark) {
    if (!card) return;
    await rateFlashcard(session.id, card.id, mark);
    await saveTime();
    await advance(mark);
  }
  async function check() {
    if (!card) return;
    const result = await post(
      `/api/flashcards/${encodeURIComponent(card.id)}/mark`,
      { answer, sessionId: session.id },
    );
    setVerdict(result);
    setMarks((prev) => new Map(prev).set(card.id, result.mark));
    await saveTime();
  }
  return (
    <main className="mx-auto min-h-screen max-w-4xl space-y-6 px-5 py-6 sm:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/flashcards" aria-label="Claro flashcards">
          <Logo />
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => act(finish)}>
            Finish now
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await saveTime();
                router.push("/flashcards");
              })
            }
          >
            Exit
          </Button>
        </div>
      </header>
      <div className="space-y-3">
        <h1 className="text-2xl sm:text-3xl">{deckName}</h1>
        <p aria-live="polite">
          {card
            ? `Card ${session.config.card_ids.indexOf(card.id) + 1} of ${session.config.card_ids.length}`
            : "Deck complete"}{" "}
          · {session.config.mode === "study" ? "Study" : "Test"}
        </p>
        {recycled > 0 && (
          <p>
            {recycled} {recycled === 1 ? "card" : "cards"} coming back
          </p>
        )}
        <div
          aria-label={`${done} of ${session.config.card_ids.length} cards known`}
          className="flex flex-wrap gap-2"
        >
          {session.config.card_ids.map((id, i) => (
            <span
              key={id}
              aria-label={`Card ${i + 1}: ${marks.get(id) === 1 ? "known" : marks.has(id) ? "retry" : "new"}`}
              className={`size-3 rounded-full ${marks.get(id) === 1 ? "bg-ink" : marks.has(id) ? "bg-brand" : "bg-paper"}`}
            />
          ))}
        </div>
      </div>
      {card ? (
        <article
          data-card-id={card.id}
          className="panel space-y-6 p-6 sm:p-10"
          onKeyDown={(e) => {
            if (
              session.config.mode !== "study" ||
              !flipped ||
              busy ||
              e.target instanceof HTMLTextAreaElement
            )
              return;
            const mark = (
              { "1": 0, "2": 0.5, "3": 1 } as Record<string, FlashcardMark>
            )[e.key];
            if (mark !== undefined) {
              e.preventDefault();
              act(() => rate(mark));
            }
          }}
        >
          <div>
            <p className="eyebrow">
              {card.kind === "term" ? "Define" : "Key stat"}
            </p>
            <h2
              ref={heading}
              tabIndex={-1}
              className="font-serif text-3xl break-words sm:text-4xl"
            >
              {card.front}
            </h2>
          </div>
          {session.config.mode === "study" ? (
            flipped ? (
              <>
                <div className="bg-peach-soft rounded-2xl p-5 whitespace-pre-wrap">
                  <h3 className="mb-2 font-semibold">Model answer</h3>
                  <p>{card.back}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {(
                    [
                      [0, "Missed"],
                      [0.5, "Mostly"],
                      [1, "Knew it"],
                    ] as const
                  ).map(([mark, label]) => (
                    <Button
                      key={label}
                      variant={mark === 1 ? "default" : "outline"}
                      disabled={busy}
                      onClick={() => act(() => rate(mark))}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <p className="text-muted-foreground text-sm">
                  You can also use 1, 2 or 3 to rate this card.
                </p>
              </>
            ) : (
              <Button disabled={busy} onClick={() => setFlipped(true)}>
                Flip card
              </Button>
            )
          ) : verdict ? (
            <>
              <p role="status" className="chip">
                {verdict.mark === 1
                  ? "Knew it"
                  : verdict.mark === 0.5
                    ? "Nearly there"
                    : "Not yet"}
              </p>
              <p>{verdict.reason}</p>
              <div className="bg-peach-soft rounded-2xl p-5 whitespace-pre-wrap">
                <h3 className="mb-2 font-semibold">Model answer</h3>
                <p>{verdict.back}</p>
              </div>
              <Button
                disabled={busy}
                onClick={() => act(() => advance(verdict.mark))}
              >
                Next card
              </Button>
            </>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                act(check);
              }}
            >
              <label className="grid gap-3 font-semibold">
                Your answer
                <textarea
                  className="field min-h-40 font-normal"
                  maxLength={2000}
                  value={answer}
                  disabled={busy}
                  onChange={(e) => setAnswer(e.target.value)}
                />
              </label>
              <Button type="submit" disabled={busy || !answer.trim()}>
                Check answer
              </Button>
            </form>
          )}
        </article>
      ) : (
        <section className="panel space-y-4 p-6">
          <h2>All cards reviewed</h2>
          <p>
            Finish your session to see your first-try score and next review
            dates.
          </p>
          <Button disabled={busy} onClick={() => act(finish)}>
            See results
          </Button>
        </section>
      )}
      {busy && <p role="status">Saving or checking your review…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </main>
  );
}
