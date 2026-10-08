"use client";
import { useActionState, useState } from "react";
import { createHomework, updateHomework } from "@/app/admin/homework/actions";
import { homeworkCounts, sydneyInput, type HomeworkSet } from "@/lib/homework";
import type { Topic, Attempt } from "@/lib/practice";
import type { Flashcard } from "@/lib/flashcards";
import { Button } from "./ui/button";
function Details({ set, topics }: { set?: HomeworkSet; topics: Topic[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 sm:col-span-2">
        Title
        <input
          className="field"
          name="title"
          required
          maxLength={200}
          defaultValue={set?.title}
        />
      </label>
      <label className="grid gap-2">
        Due date and time (Sydney)
        <input
          className="field min-w-0"
          type="datetime-local"
          name="due"
          required
          defaultValue={set ? sydneyInput(set.due_at) : undefined}
        />
      </label>
      <label className="grid min-w-0 gap-2">
        Topic
        <select
          className="field max-w-full"
          name="topic"
          defaultValue={set?.topic_id ?? ""}
        >
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
export function NewHomework({ topics }: { topics: Topic[] }) {
  const [state, action, pending] = useActionState(createHomework, {});
  return (
    <form action={action} className="panel space-y-5 p-6">
      <h2>New homework set</h2>
      <Details topics={topics} />
      {state.error && <p role="alert">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        Create draft and open
      </Button>
    </form>
  );
}
export function HomeworkBuilder({
  set,
  topics,
  cards,
  questions,
  started,
}: {
  set: HomeworkSet;
  topics: Topic[];
  cards: Flashcard[];
  questions: Attempt["question"][];
  started: number;
}) {
  const [state, action, pending] = useActionState(updateHomework, {});
  const [cardSelection, setCards] = useState(
    set.items.flatMap((i) => (i.flashcard_id ? [i.flashcard_id] : [])),
  );
  const [questionSelection, setQuestions] = useState(
    set.items.flatMap((i) => (i.question_id ? [i.question_id] : [])),
  );
  const locked = Boolean(set.published_at || started);
  const chosenCards = cardSelection.flatMap(
    (id) => cards.find((c) => c.id === id) ?? [],
  );
  const chosenQuestions = questionSelection.flatMap(
    (id) => questions.find((q) => q.id === id) ?? [],
  );
  const counts = homeworkCounts([
    ...chosenCards.map((c, i) => ({
      position: i,
      flashcard_id: c.id,
      question_id: null,
    })),
    ...chosenQuestions.map((q, i) => ({
      position: i,
      question_id: q.id,
      flashcard_id: null,
      question: q,
    })),
  ]);
  function toggle(
    id: string,
    checked: boolean,
    selection: string[],
    setter: (ids: string[]) => void,
  ) {
    setter(checked ? [...selection, id] : selection.filter((v) => v !== id));
  }
  return (
    <form action={action} className="space-y-6">
      <input name="id" type="hidden" value={set.id} />
      <section className="panel space-y-4 p-6">
        <Details set={set} topics={topics} />
        <p className="chip">
          {set.published_at ? "Published" : "Draft"} · {started} students
          started
        </p>
        {locked && (
          <p>
            Items are locked{" "}
            {started
              ? "because a student has started"
              : "while this set is published"}
            .{" "}
            {started
              ? "Unpublishing is also blocked."
              : "Unpublish before editing items."}
          </p>
        )}
      </section>
      <section className="panel space-y-4 p-6">
        <h2>Current selection</h2>
        <p>
          {counts.cards} flashcards · {counts.mc} multiple choice ·{" "}
          {counts.written} short answers
        </p>
        <p className="font-semibold">TOTAL MARKS: {counts.marks}</p>
        <ol className="list-decimal space-y-2 pl-5">
          {chosenCards.map((c) => (
            <li key={c.id}>{c.front}</li>
          ))}
          {chosenQuestions.map((q) => (
            <li key={q.id}>
              {q.stem} · {q.marks} marks
            </li>
          ))}
        </ol>
        {!chosenCards.length && !chosenQuestions.length && (
          <p>Select items below, then save before changing filters.</p>
        )}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        {[
          ["Flashcards", cards],
          ["Questions", questions],
        ].map(([label, rows]) => (
          <fieldset
            className="panel min-w-0 space-y-4 p-5"
            key={label as string}
          >
            <legend className="px-2 text-xl font-semibold">
              {label as string}
            </legend>
            <div className="max-h-[32rem] space-y-3 overflow-y-auto">
              {(rows as (Flashcard | Attempt["question"])[]).map((row) => {
                const card = "front" in row;
                const selected = card ? cardSelection : questionSelection;
                return (
                  <label
                    className="border-line flex items-start gap-3 rounded-2xl border p-3"
                    key={row.id}
                  >
                    <input
                      type="checkbox"
                      aria-label={
                        card
                          ? `Flashcard: ${row.front}`
                          : `Question: ${row.stem}`
                      }
                      checked={selected.includes(row.id)}
                      disabled={locked || pending}
                      onChange={(e) =>
                        toggle(
                          row.id,
                          e.target.checked,
                          selected,
                          card ? setCards : setQuestions,
                        )
                      }
                    />
                    <span className="min-w-0 break-words">
                      {card ? row.front : row.stem}
                      <small className="text-muted-foreground mt-2 block">
                        {row.topic_id} ·{" "}
                        {card
                          ? row.kind
                          : `${row.type} · ${row.marks} marks · ${row.year ?? ""}`}
                      </small>
                    </span>
                  </label>
                );
              })}
              {!(rows as unknown[]).length && (
                <p>No items match these filters.</p>
              )}
            </div>
          </fieldset>
        ))}
      </div>
      {cardSelection.map((id) => (
        <input type="hidden" name="cards" value={id} key={id} />
      ))}
      {questionSelection.map((id) => (
        <input type="hidden" name="questions" value={id} key={id} />
      ))}
      {state.error && (
        <p role="alert" className="panel border-destructive p-4">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" name="operation" value="save" disabled={pending}>
          Save
        </Button>
        {set.published_at ? (
          <Button
            type="submit"
            name="operation"
            value="unpublish"
            formNoValidate
            disabled={pending || started > 0}
          >
            Unpublish
          </Button>
        ) : (
          <>
            <Button
              type="submit"
              name="operation"
              value="publish"
              formNoValidate
              disabled={pending}
            >
              Publish
            </Button>
            <Button
              variant="outline"
              type="submit"
              name="operation"
              value="delete"
              formNoValidate
              disabled={pending || started > 0}
            >
              Delete draft
            </Button>
          </>
        )}
      </div>
      <p className="text-sm">
        Save your selection and due date before publishing. Publishing needs at
        least one item and a due date in the future.
      </p>
    </form>
  );
}
