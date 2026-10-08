"use client";
import { useActionState, useState } from "react";
import { startSprint } from "@/app/(app)/actions";
import { modes, type Topic } from "@/lib/practice";
import { Button } from "./ui/button";
export function PracticeSetup({
  topics,
  initial,
}: {
  topics: Topic[];
  initial: string[];
}) {
  const [selected, setSelected] = useState(initial);
  const [state, action, pending] = useActionState(startSprint, {});
  function toggle(t: Topic) {
    setSelected((old) =>
      old.includes(t.id)
        ? old.filter((id) => id !== t.id)
        : [
            ...old.filter(
              (id) =>
                t.parent_id !== null ||
                topics.find((x) => x.id === id)?.parent_id !== t.id,
            ),
            t.id,
          ].slice(0, 2),
    );
  }
  return (
    <form action={action} className="panel space-y-6">
      <fieldset>
        <legend className="mb-3 text-base font-semibold">
          Choose your mode
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(modes).map(([id, m]) => (
            <label
              key={id}
              className="has-checked:border-brand has-checked:bg-peach-soft flex cursor-pointer items-center gap-3 rounded-xl border p-4"
            >
              <input
                type="radio"
                name="mode"
                value={id}
                defaultChecked={id === "mcq"}
              />
              <span>
                <strong>{m.label}</strong>
                <span className="mt-1 block text-sm">
                  {m.marks} marks · {m.minutes} minutes
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-base font-semibold">
          Choose up to two topics
        </legend>
        <p className="mt-2 mb-4 text-sm">
          Leave all topics unselected to practise the whole course. A topic
          includes its subtopics.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {topics
            .filter((t) => !t.parent_id)
            .map((parent) => (
              <div key={parent.id} className="space-y-3 rounded-xl border p-4">
                {[
                  parent,
                  ...topics.filter((t) => t.parent_id === parent.id),
                ].map((t) => (
                  <label
                    key={t.id}
                    className={`flex items-start gap-3 ${t.parent_id ? "pl-3 text-sm" : "font-semibold"}`}
                  >
                    <input
                      className="mt-1"
                      type="checkbox"
                      name="topics"
                      value={t.id}
                      checked={selected.includes(t.id)}
                      disabled={
                        !selected.includes(t.id) &&
                        (selected.length >= 2 ||
                          Boolean(
                            t.parent_id && selected.includes(t.parent_id),
                          ))
                      }
                      onChange={() => toggle(t)}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            ))}
        </div>
      </fieldset>
      {state.error && (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Starting your sprint…" : "Start sprint"}
      </Button>
    </form>
  );
}
export function QuickStarts() {
  const [state, action, pending] = useActionState(startSprint, {});
  return (
    <form action={action}>
      <div className="flex flex-wrap gap-3">
        {(["mcq", "short", "mixed"] as const).map((mode) => (
          <Button
            key={mode}
            name="mode"
            value={mode}
            type="submit"
            disabled={pending}
          >
            {modes[mode].label}
          </Button>
        ))}
      </div>
      {state.error && (
        <p role="alert" className="text-destructive mt-3">
          {state.error}
        </p>
      )}
    </form>
  );
}
