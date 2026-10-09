"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { ChevronDown, Minus, Plus, SearchX } from "lucide-react";
import { startSprint } from "@/app/(app)/actions";
import { createClient } from "@/utils/supabase/client";
import { modes, type Mode, type Topic } from "@/lib/practice";
import {
  clampTarget,
  DEFAULTS,
  estimateMinutes,
  filtersOn,
  fromParams,
  HISTORY_LABELS,
  restore,
  size,
  summary,
  withMode,
  withSizeBy,
  type Difficulty,
  type History,
  type Pool,
  type SetupConfig,
} from "@/lib/sprint";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { Input } from "./ui/input";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Switch } from "./ui/switch";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

const KEY = "claro.sprint.v1";
const DIFFICULTY: [Difficulty, string][] = [
  ["foundation", "Foundation · 1–3 marks"],
  ["standard", "Standard · 4–5 marks"],
  ["challenging", "Challenging · 6+ marks"],
];
const n = (v: number | undefined) => (v === undefined ? "–" : String(v));

function Section({
  title,
  children,
  hint,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3" aria-label={title}>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, React.ReactNode, boolean?][];
  onChange: (v: T) => void;
}) {
  return (
    <RadioGroup
      aria-label={label}
      value={value}
      onValueChange={(v) => onChange(v as T)}
    >
      {options.map(([v, text, disabled]) => (
        <label
          key={v}
          className={cn(
            "flex items-center gap-2 text-sm",
            disabled && "text-muted-foreground",
          )}
        >
          <RadioGroupItem value={v} disabled={disabled} />
          {text}
        </label>
      ))}
    </RadioGroup>
  );
}

/** §3.2 Topic Sprint setup: every control updates the live pool; the bar is the confirmation. */
export function SprintSetup({
  topics,
  params,
}: {
  topics: Topic[];
  params: Record<string, string | undefined>;
}) {
  const [c, setC] = useState<SetupConfig>(DEFAULTS);
  const [prefilled, setPrefilled] = useState<SetupConfig | null>(null);
  const [pool, setPool] = useState<Pool | null>(null);
  const [poolError, setPoolError] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const [state, action, pending] = useActionState(startSprint, {});
  const form = useRef<HTMLFormElement>(null);
  const ready = useRef(false);
  const parents = topics.filter((t) => !t.parent_id);
  const names = Object.fromEntries(topics.map((t) => [t.id, t.name]));

  useEffect(() => {
    // Saved setup lives in localStorage, which only exists after mount.
    let saved = DEFAULTS;
    try {
      saved = restore(JSON.parse(localStorage.getItem(KEY) ?? "null"));
    } catch {}
    const fromUrl = fromParams(params, saved);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setC(fromUrl ?? saved);
    if (fromUrl) setPrefilled(saved);
    ready.current = true;
  }, [params]);

  useEffect(() => {
    if (!ready.current) return;
    localStorage.setItem(KEY, JSON.stringify(c));
    let live = true;
    const t = setTimeout(async () => {
      const { data, error } = await createClient().rpc("sprint_pool", {
        p_config: c,
      });
      if (!live) return;
      setPoolError(!!error);
      if (!error) setPool(data as Pool);
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [c]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        form.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const set = (patch: Partial<SetupConfig>) =>
    setC((o) => ({ ...o, ...patch }));
  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  function toggleTopic(id: string) {
    if (!c.topics.includes(id) && c.topics.length >= 2) {
      setLimitHit(true);
      return;
    }
    setLimitHit(false);
    set({
      topics: toggle(c.topics, id),
      subtopics: c.subtopics.filter((s) => !s.startsWith(`${id}-`)),
    });
  }

  const s = size(c);
  const written = c.mode === "short" || c.mode === "mixed";
  const byMarks = c.size_by === "marks";
  const available = pool ? (byMarks ? pool.marks : pool.questions) : null;
  const shortfall = available !== null && available > 0 && available < c.target;
  const unit = byMarks ? "marks" : "questions";
  const minutes = estimateMinutes(c);
  const years = pool?.years ?? null;
  const yearList = years
    ? Array.from({ length: years[1] - years[0] + 1 }, (_, i) => years[0] + i)
    : [];
  const fixes = pool
    ? (
        [
          [
            "Include seen questions",
            pool.any - pool.questions,
            { history: "any" },
          ],
          [
            "All subtopics",
            pool.all_subtopics - pool.any,
            { subtopics: [] as string[] },
          ],
          [
            "All years",
            pool.all_years - pool.any,
            { year_from: null, year_to: null },
          ],
        ] as [string, number, Partial<SetupConfig>][]
      ).filter(([, k]) => k > 0)
    : [];

  return (
    <div className="mx-auto max-w-[720px] space-y-4 pb-32">
      {prefilled && (
        <p className="text-muted-foreground text-sm" role="status">
          Prefilled from a link.{" "}
          <button
            type="button"
            className="text-foreground underline"
            onClick={() => {
              setC(prefilled);
              setPrefilled(null);
            }}
          >
            Undo
          </button>
        </p>
      )}
      <Card>
        <CardContent className="space-y-7">
          <Section title="Question type">
            <ToggleGroup
              aria-label="Question type"
              variant="outline"
              className="flex-wrap"
              value={[c.mode]}
              onValueChange={(v) => v[0] && setC(withMode(c, v[0] as Mode))}
            >
              {Object.entries(modes).map(([id, m]) => (
                <ToggleGroupItem key={id} value={id}>
                  {m.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {c.mode === "mixed" && (
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={c.include_extended}
                  onCheckedChange={(v) => set({ include_extended: v })}
                />
                Include an extended response (20 marks, +35 min)
              </label>
            )}
          </Section>

          <Section
            title="Topics"
            hint="Up to 2. None selected practises the whole course."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {parents.map((t) => {
                const on = c.topics.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleTopic(t.id)}
                    className={cn(
                      "rounded-xl border p-3 text-left text-sm transition-colors",
                      on ? "border-primary bg-accent" : "hover:bg-muted",
                    )}
                  >
                    <span className="block font-medium">{t.name}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {n(pool?.topics[t.id] ?? (pool ? 0 : undefined))}{" "}
                      questions
                    </span>
                  </button>
                );
              })}
            </div>
            {limitHit && (
              <p role="status" className="text-warning text-xs">
                Up to 2 topics. Deselect one first.
              </p>
            )}
          </Section>

          {c.topics.length > 0 && (
            <Section
              title="Subtopics"
              hint="None selected covers the whole topic."
            >
              {c.topics.map((p) => {
                const subs = topics.filter((t) => t.parent_id === p);
                const chosen = c.subtopics.filter((x) => x.startsWith(`${p}-`));
                return (
                  <div key={p} className="space-y-1.5">
                    <p className="text-muted-foreground text-xs">{names[p]}</p>
                    <div
                      className="flex flex-wrap gap-1.5"
                      role="group"
                      aria-label={`${names[p]} subtopics`}
                    >
                      <Chip
                        on={chosen.length === 0}
                        onClick={() =>
                          set({
                            subtopics: c.subtopics.filter(
                              (x) => !x.startsWith(`${p}-`),
                            ),
                          })
                        }
                      >
                        All
                      </Chip>
                      {subs.map((t) => {
                        const count = pool?.subtopics[t.id] ?? 0;
                        return (
                          <Chip
                            key={t.id}
                            on={c.subtopics.includes(t.id)}
                            disabled={!!pool && count === 0}
                            onClick={() =>
                              set({ subtopics: toggle(c.subtopics, t.id) })
                            }
                          >
                            {t.name} · {pool ? count : "–"}
                          </Chip>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </Section>
          )}

          <Section title="Size">
            {c.mode === "short" && (
              <ToggleGroup
                aria-label="Size by"
                variant="outline"
                size="sm"
                value={[c.size_by]}
                onValueChange={(v) =>
                  v[0] && setC(withSizeBy(c, v[0] as SetupConfig["size_by"]))
                }
              >
                <ToggleGroupItem value="marks">Marks</ToggleGroupItem>
                <ToggleGroupItem value="questions">Questions</ToggleGroupItem>
              </ToggleGroup>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Decrease"
                onClick={() =>
                  set({ target: clampTarget(c, c.target - s.step) })
                }
              >
                <Minus />
              </Button>
              <Input
                aria-label={byMarks ? "Marks" : "Questions"}
                inputMode="numeric"
                className="w-16 text-center tabular-nums"
                value={c.target}
                onChange={(e) =>
                  /^\d*$/.test(e.target.value) &&
                  set({ target: Number(e.target.value) || 0 })
                }
                onBlur={() => set({ target: clampTarget(c, c.target) })}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Increase"
                onClick={() =>
                  set({ target: clampTarget(c, c.target + s.step) })
                }
              >
                <Plus />
              </Button>
              <span className="text-muted-foreground text-sm">
                {unit} ({s.min}–{s.max})
              </span>
              <div className="flex gap-1">
                {s.presets.map((p) => (
                  <Chip
                    key={p}
                    on={c.target === p}
                    onClick={() => set({ target: p })}
                  >
                    {p}
                  </Chip>
                ))}
              </div>
            </div>
          </Section>

          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-semibold">
              <span>
                More filters
                {filtersOn(c) > 0 && (
                  <span className="text-muted-foreground ml-2 font-normal">
                    {filtersOn(c)} {filtersOn(c) === 1 ? "filter" : "filters"}{" "}
                    on
                  </span>
                )}
              </span>
              <ChevronDown className="size-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-5 pt-4">
              {c.mode === "short" || c.mode === "mixed" ? (
                <Section
                  title="Difficulty (by marks)"
                  hint="Written questions only."
                >
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="group"
                    aria-label="Difficulty"
                  >
                    {DIFFICULTY.map(([d, label]) => (
                      <Chip
                        key={d}
                        on={c.difficulty.includes(d)}
                        onClick={() =>
                          set({ difficulty: toggle(c.difficulty, d) })
                        }
                      >
                        {label} ·{" "}
                        {n(pool?.difficulty[d] ?? (pool ? 0 : undefined))}
                      </Chip>
                    ))}
                  </div>
                </Section>
              ) : null}
              {written && pool && Object.keys(pool.verbs).length > 0 && (
                <Section title="Directive verb">
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="group"
                    aria-label="Directive verb"
                  >
                    {Object.entries(pool.verbs)
                      .sort((a, b) => b[1] - a[1])
                      .map(([v, k]) => (
                        <Chip
                          key={v}
                          on={c.verbs.includes(v)}
                          onClick={() => set({ verbs: toggle(c.verbs, v) })}
                        >
                          {v} · {k}
                        </Chip>
                      ))}
                  </div>
                </Section>
              )}
              {years && (
                <Section title="Years">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {(["year_from", "year_to"] as const).map((k, i) => (
                      <Select
                        key={k}
                        value={String(c[k] ?? years[i])}
                        onValueChange={(v) => {
                          const y = {
                            year_from: c.year_from ?? years[0],
                            year_to: c.year_to ?? years[1],
                            [k]: Number(v),
                          };
                          // From ≤ To: swap rather than reject.
                          const [from, to] = [y.year_from, y.year_to].sort();
                          set({ year_from: from, year_to: to });
                        }}
                      >
                        <SelectTrigger
                          aria-label={i ? "To year" : "From year"}
                          className="w-24"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {yearList.map((y) => (
                            <SelectItem key={y} value={String(y)}>
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ))}
                    <button
                      type="button"
                      className="underline"
                      onClick={() =>
                        set({ year_from: years[1] - 4, year_to: years[1] })
                      }
                    >
                      Last 5 years
                    </button>
                  </div>
                </Section>
              )}
              {pool?.trial && (
                <Section title="Source">
                  <div
                    className="flex gap-1.5"
                    role="group"
                    aria-label="Source"
                  >
                    {(
                      [
                        ["nesa", "HSC papers"],
                        ["a1", "Trial papers"],
                      ] as const
                    ).map(([o, label]) => (
                      <Chip
                        key={o}
                        on={c.origins.length === 0 || c.origins.includes(o)}
                        onClick={() => {
                          // Empty = both; never deselect the last one.
                          const next = toggle<"nesa" | "a1">(
                            c.origins.length ? c.origins : ["nesa", "a1"],
                            o,
                          );
                          if (next.length)
                            set({ origins: next.length === 2 ? [] : next });
                        }}
                      >
                        {label}
                      </Chip>
                    ))}
                  </div>
                </Section>
              )}
            </CollapsibleContent>
          </Collapsible>

          <Section
            title="Question history"
            hint="Seen means answered in a finished sprint."
          >
            <Choice<History>
              label="Question history"
              value={c.history}
              onChange={(history) => set({ history })}
              options={(
                [
                  ["prefer_new", "any"],
                  ["new_only", "new"],
                  ["mistakes", "mistakes"],
                  ["flagged", "flagged"],
                  ["any", "any"],
                ] as const
              ).map(([h, k]) => [
                h,
                <>
                  {HISTORY_LABELS[h]}
                  <span className="text-muted-foreground tabular-nums">
                    {" "}
                    · {n(pool?.[k])}
                  </span>
                </>,
                !!pool &&
                  h !== "prefer_new" &&
                  h !== "any" &&
                  pool[k] === 0 &&
                  c.history !== h,
              ])}
            />
          </Section>

          <Section
            title="Order"
            hint="Questions are always chosen at random; this only sets the order."
          >
            <Choice
              label="Order"
              value={c.order}
              onChange={(order) => set({ order })}
              options={[
                ["exam", "Exam order (multiple choice first, then by year)"],
                ["shuffled", "Shuffled"],
              ]}
            />
          </Section>

          <Section title="Timer">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={c.timed}
                onCheckedChange={(timed) => set({ timed })}
              />
              Timed
            </label>
            {c.timed && (
              <>
                <Choice
                  label="Pace"
                  value={c.pace}
                  onChange={(pace) => set({ pace })}
                  options={[
                    ["hsc", "HSC pace"],
                    ["relaxed", "Relaxed (1.5× time)"],
                    ["custom", "Custom"],
                  ]}
                />
                {c.pace === "custom" && (
                  <div className="flex items-center gap-2 text-sm">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="5 minutes less"
                      onClick={() =>
                        set({
                          custom_minutes: Math.max(5, c.custom_minutes - 5),
                        })
                      }
                    >
                      <Minus />
                    </Button>
                    <Input
                      aria-label="Minutes"
                      inputMode="numeric"
                      className="w-16 text-center tabular-nums"
                      value={c.custom_minutes}
                      onChange={(e) =>
                        /^\d*$/.test(e.target.value) &&
                        set({ custom_minutes: Number(e.target.value) || 0 })
                      }
                      onBlur={() =>
                        set({
                          custom_minutes: Math.min(
                            180,
                            Math.max(5, c.custom_minutes),
                          ),
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="5 minutes more"
                      onClick={() =>
                        set({
                          custom_minutes: Math.min(180, c.custom_minutes + 5),
                        })
                      }
                    >
                      <Plus />
                    </Button>
                    minutes (5–180)
                  </div>
                )}
                <p className="text-muted-foreground text-xs">≈ {minutes} min</p>
                <Choice
                  label="When time runs out"
                  value={c.on_timeout}
                  onChange={(on_timeout) => set({ on_timeout })}
                  options={[
                    ["overtime", "Keep going and show overtime"],
                    ["finish", "Finish and mark automatically"],
                  ]}
                />
              </>
            )}
          </Section>

          <Section title="Feedback">
            <Choice
              label="Feedback"
              value={c.feedback}
              onChange={(feedback) => set({ feedback })}
              options={[
                ["end", "At the end (exam style)"],
                ["each", "After each question (check as you go)"],
              ]}
            />
          </Section>
        </CardContent>
      </Card>

      {pool?.questions === 0 && (
        <EmptyState
          icon={SearchX}
          title="No questions match"
          description="Widen your filters to build a sprint."
          action={
            fixes.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {fixes.map(([label, k, patch]) => (
                  <Button
                    key={label}
                    variant="outline"
                    size="sm"
                    onClick={() => set(patch)}
                  >
                    {label} (+{k})
                  </Button>
                ))}
              </div>
            )
          }
        />
      )}

      <form
        ref={form}
        action={action}
        className="bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur"
      >
        <input type="hidden" name="config" value={JSON.stringify(c)} />
        <div className="mx-auto flex max-w-[720px] flex-wrap items-center gap-3 px-4 py-3 md:pl-[calc(var(--sidebar-width,0px)+1rem)]">
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium">{summary(c, names, years)}</p>
            <p
              className="text-muted-foreground tabular-nums"
              aria-live="polite"
            >
              {poolError
                ? "Couldn't count matching questions."
                : `${n(pool?.questions)} questions match · ${n(pool?.new)} new`}
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={() => setC(DEFAULTS)}>
            Reset
          </Button>
          <Button type="submit" disabled={pending || pool?.questions === 0}>
            {pending
              ? "Building…"
              : shortfall
                ? `Start with ${available} ${unit}`
                : "Start sprint"}
          </Button>
        </div>
        {(shortfall || state.error) && (
          <div className="mx-auto max-w-[720px] px-4 pb-3 text-sm">
            {shortfall && (
              <p role="alert" className="text-warning">
                Only {available} {unit} match. Start with {available} {unit} or
                widen your filters.
              </p>
            )}
            {state.error && (
              <p role="alert" className="text-destructive">
                Couldn’t start the sprint. {state.error}
              </p>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

function Chip({
  on,
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40",
        on ? "border-primary bg-accent" : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/** One-click starts with the §3.2 defaults (used on Home). */
export function QuickStarts() {
  const [state, action, pending] = useActionState(startSprint, {});
  return (
    <form action={action}>
      <div className="flex flex-wrap gap-3">
        {(["mcq", "short", "mixed"] as const).map((mode) => (
          <Button
            key={mode}
            name="config"
            value={JSON.stringify(withMode(DEFAULTS, mode))}
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
