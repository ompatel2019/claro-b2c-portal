"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { startFlashcards } from "@/app/(app)/flashcards/actions";
import {
  clampDeckSize,
  deckCounts,
  DECK_DEFAULTS,
  restoreDeck,
  type DeckCard,
  type DeckConfig,
  type DeckHistory,
} from "@/lib/deck";
import { plural, type Topic } from "@/lib/practice";
import { SearchOff } from "@/components/icons";
import { EmptyState } from "./empty-state";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

const KEY = "claro.flashcards.v1";
function Options({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: string;
  options: {
    value: string;
    label: string;
    disabled?: boolean;
    reason?: string;
  }[];
  onChange: (value: string) => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ToggleGroup
        size="lg"
        aria-label={title}
        variant="outline"
        className="flex-wrap"
        value={[value]}
        onValueChange={(v) => v[0] && onChange(v[0])}
      >
        {options.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {options
        .filter((o) => o.disabled && o.reason)
        .map((o) => (
          <p key={o.value} className="text-muted-foreground text-xs">
            {o.reason}
          </p>
        ))}
    </section>
  );
}
export function FlashcardBuilder({
  cards,
  topics,
  history,
  topic,
}: {
  cards: DeckCard[];
  topics: Topic[];
  history: DeckHistory;
  topic?: string;
}) {
  const [c, setC] = useState<DeckConfig>(DECK_DEFAULTS);
  const [customSize, setCustomSize] = useState("20");
  const [custom, setCustom] = useState(false);
  const [speech, setSpeech] = useState(false);
  const [state, action, pending] = useActionState(startFlashcards, {});
  const ready = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    let saved = DECK_DEFAULTS;
    try {
      saved = restoreDeck(JSON.parse(localStorage.getItem(KEY) ?? "null"));
    } catch {}
    const hasSpeech =
      "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
    if (!hasSpeech && saved.answer_by === "speaking")
      saved = { ...saved, answer_by: "either" };
    const selected = topics.find((t) => t.id === topic);
    if (selected)
      saved = {
        ...saved,
        topics: [selected.parent_id ?? selected.id],
        subtopics: selected.parent_id ? [selected.id] : [],
      };
    // Browser preferences and capabilities are available only after mounting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setC(saved);
    setCustom(
      typeof saved.size === "number" && ![10, 20, 30, 50].includes(saved.size),
    );
    setCustomSize(String(saved.size === "all" ? 20 : saved.size));
    setSpeech(hasSpeech);
    ready.current = true;
  }, [topic, topics]);
  useEffect(() => {
    if (ready.current) {
      try {
        localStorage.setItem(KEY, JSON.stringify(c));
      } catch {}
    }
  }, [c]);
  const counts = deckCounts(cards, c, history);
  const customNumber = clampDeckSize(
    customSize === "" ? 20 : Number(customSize),
    200,
  );
  const size = clampDeckSize(custom ? customNumber : c.size, counts.total);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "Enter" &&
        !(
          e.target instanceof HTMLElement &&
          e.target.closest("input,textarea,[contenteditable=true]")
        )
      ) {
        e.preventDefault();
        if (size > 0 && !pending) form.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [size, pending]);
  const set = (patch: Partial<DeckConfig>) =>
    setC((prev) => ({ ...prev, ...patch }));
  const selectedNames = (
    c.topics.length
      ? c.topics.flatMap((parent) => {
          const subs = c.subtopics.filter((id) => id.startsWith(`${parent}-`));
          return subs.length ? subs : [parent];
        })
      : c.subtopics
  )
    .map((id) => topics.find((t) => t.id === id)?.name)
    .filter(Boolean);
  const names = selectedNames.length
    ? `${selectedNames.slice(0, 2).join(", ")}${selectedNames.length > 2 ? ` +${selectedNames.length - 2} more` : ""}`
    : "All topics";
  const mine = cards.filter((card) => card.owner_id === history.userId).length;
  const kinds = c.kinds.length === 2 ? "both" : c.kinds[0];
  const sizeValue = custom ? "custom" : String(c.size);
  const toggleSubtopic = (id: string, parent: string) => {
    const subtopics = c.subtopics.includes(id)
      ? c.subtopics.filter((s) => s !== id)
      : [...c.subtopics, id];
    set({
      topics: subtopics.some((s) => s.startsWith(`${parent}-`))
        ? c.topics.includes(parent)
          ? c.topics
          : [...c.topics, parent]
        : c.topics.filter((p) => p !== parent),
      subtopics,
    });
  };
  return (
    <div className="mx-auto max-w-[720px] space-y-4 pb-8">
      <Card>
        <CardContent className="space-y-7">
          <Options
            title="Mode"
            value={c.mode}
            options={[
              { value: "study", label: "Study" },
              { value: "test", label: "Test" },
            ]}
            onChange={(mode) => set({ mode: mode as DeckConfig["mode"] })}
          />
          <p className="text-muted-foreground text-xs">
            {c.mode === "study"
              ? "Flip and rate yourself."
              : "Type or say it, we check it."}
          </p>
          <Options
            title="Card type"
            value={kinds}
            options={[
              {
                value: "term",
                label: `Terms (${counts.kinds.term})`,
                disabled: counts.kinds.term === 0,
              },
              {
                value: "stat",
                label: `Stats (${counts.kinds.stat})`,
                disabled: counts.kinds.stat === 0,
              },
              { value: "both", label: `Both (${counts.kinds.both})` },
            ]}
            onChange={(kind) =>
              set({
                kinds:
                  kind === "both"
                    ? ["term", "stat"]
                    : [kind as "term" | "stat"],
              })
            }
          />
          <Options
            title="Source"
            value={c.source}
            options={[
              { value: "claro", label: `Claro cards (${counts.source.claro})` },
              {
                value: "my",
                label: `My cards (${counts.source.my})`,
                disabled: counts.source.my === 0,
                reason:
                  counts.source.my === 0
                    ? mine === 0
                      ? "Make your own in My cards"
                      : "No My cards match these filters."
                    : undefined,
              },
              { value: "both", label: `Both (${counts.source.both})` },
            ]}
            onChange={(source) =>
              set({ source: source as DeckConfig["source"] })
            }
          />
          <section className="space-y-4">
            <h2 className="text-sm font-semibold">Topics</h2>
            <p className="text-muted-foreground text-xs">
              None selected covers the whole course.
            </p>
            {topics
              .filter((t) => !t.parent_id)
              .map((parent) => (
                <div key={parent.id} className="space-y-2">
                  <h3 className="text-sm font-semibold">
                    {parent.name} · {counts.topics[parent.id] ?? 0}
                  </h3>
                  <ToggleGroup
                    multiple
                    size="lg"
                    aria-label={`${parent.name} subtopics`}
                    className="flex-wrap"
                    variant="outline"
                    value={
                      c.subtopics.filter((id) => id.startsWith(`${parent.id}-`))
                        .length
                        ? c.subtopics
                        : c.topics.includes(parent.id)
                          ? ["all"]
                          : []
                    }
                  >
                    <ToggleGroupItem
                      value="all"
                      disabled={!counts.topics[parent.id]}
                      onClick={() =>
                        set({
                          topics:
                            c.topics.includes(parent.id) &&
                            !c.subtopics.some((id) =>
                              id.startsWith(`${parent.id}-`),
                            )
                              ? c.topics.filter((id) => id !== parent.id)
                              : c.topics.includes(parent.id)
                                ? c.topics
                                : [...c.topics, parent.id],
                          subtopics: c.subtopics.filter(
                            (id) => !id.startsWith(`${parent.id}-`),
                          ),
                        })
                      }
                    >
                      All
                    </ToggleGroupItem>
                    {topics
                      .filter((t) => t.parent_id === parent.id)
                      .map((t) => (
                        <ToggleGroupItem
                          key={t.id}
                          value={t.id}
                          disabled={!counts.subtopics[t.id]}
                          onClick={() => toggleSubtopic(t.id, parent.id)}
                        >
                          {t.name} · {counts.subtopics[t.id] ?? 0}
                        </ToggleGroupItem>
                      ))}
                  </ToggleGroup>
                </div>
              ))}
          </section>
          <Options
            title="Which cards"
            value={c.which}
            options={(
              [
                ["all", "All matching"],
                ["due", "Due"],
                ["new", "New, never reviewed"],
                ["missed", "Missed last time"],
              ] as const
            ).map(([value, label]) => ({
              value,
              label: `${label} (${counts.which[value]})`,
              disabled: counts.which[value] === 0,
            }))}
            onChange={(which) => set({ which: which as DeckConfig["which"] })}
          />
          <Options
            title="Deck size"
            value={sizeValue}
            options={[10, 20, 30, 50]
              .map((n) => ({ value: String(n), label: String(n) }))
              .concat([
                { value: "all", label: `All (${counts.total})` },
                { value: "custom", label: "Custom" },
              ])}
            onChange={(value) => {
              setCustom(value === "custom");
              if (value !== "custom")
                set({ size: value === "all" ? "all" : Number(value) });
              else setCustomSize(String(c.size === "all" ? 20 : c.size));
            }}
          />
          {custom && (
            <Input
              aria-label="Custom deck size"
              type="number"
              min={1}
              max={200}
              className="w-24"
              value={customSize}
              onChange={(e) => setCustomSize(e.target.value)}
              onBlur={() => {
                setCustomSize(String(customNumber));
                set({ size: customNumber });
              }}
            />
          )}
          <p
            className="text-muted-foreground text-sm tabular-nums"
            role="status"
          >
            {size} of {plural(counts.total, "card")}
          </p>
          <Options
            title="Order"
            value={c.order}
            options={[
              { value: "shuffled", label: "Shuffled" },
              { value: "topic", label: "By topic" },
            ]}
            onChange={(order) => set({ order: order as DeckConfig["order"] })}
          />
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={c.repeat_missed}
              onCheckedChange={(repeat_missed) => set({ repeat_missed })}
            />
            Repeat missed cards
          </label>
          {c.mode === "test" && (
            <Options
              title="Answer by"
              value={c.answer_by}
              options={[
                { value: "typing", label: "Typing" },
                {
                  value: "speaking",
                  label: "Speaking",
                  disabled: !speech,
                  reason: !speech
                    ? "Speech input is not available in this browser."
                    : undefined,
                },
                { value: "either", label: "Either" },
              ]}
              onChange={(answer_by) =>
                set({ answer_by: answer_by as DeckConfig["answer_by"] })
              }
            />
          )}
        </CardContent>
      </Card>
      {counts.total === 0 && (
        <EmptyState
          icon={SearchOff}
          title="No cards match"
          description="Widen your selection to build a deck."
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => set({ topics: [], subtopics: [] })}
              >
                Include all topics
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  set({ which: "all", source: "both", kinds: ["term", "stat"] })
                }
              >
                All cards
              </Button>
            </div>
          }
        />
      )}
      <form
        ref={form}
        action={action}
        onSubmit={() => {
          if (custom) {
            setCustomSize(String(customNumber));
            set({ size: customNumber });
          }
        }}
        className="bg-background sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"
      >
        <input
          type="hidden"
          name="config"
          value={JSON.stringify(custom ? { ...c, size: customNumber } : c)}
        />
        <p className="text-sm">
          {plural(size, "card")} ·{" "}
          {kinds === "both"
            ? "Terms + Stats"
            : kinds === "term"
              ? "Terms"
              : "Stats"}{" "}
          · {names} · {c.mode === "study" ? "Study" : "Test"}
        </p>
        <Button
          type="submit"
          disabled={size === 0 || pending}
          aria-keyshortcuts="Meta+Enter Control+Enter"
        >
          {pending ? "Building…" : "Start"}
        </Button>
        {state.error && (
          <p role="alert" className="text-destructive w-full text-sm">
            {state.error}
          </p>
        )}
      </form>
    </div>
  );
}
