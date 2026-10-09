"use client";
import { Flag } from "@/components/icons";
import { cn } from "@/lib/utils";
import { answered, type Attempt } from "@/lib/practice";
import { type paperSections, type PaperSection } from "@/lib/paper-session";
import { Button } from "./ui/button";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Label } from "./ui/label";
type Filter = "all" | "unanswered" | "flagged";
type Progress = ReturnType<typeof paperSections>;
type Unit = Progress[number]["units"][number];
export function BookletFilter({
  filter,
  onFilter,
}: {
  filter: Filter;
  onFilter: (v: Filter) => void;
}) {
  return (
    <ToggleGroup
      className="max-w-full flex-wrap"
      aria-label="Show questions"
      size="sm"
      variant="outline"
      value={[filter]}
      onValueChange={(v) => v[0] && onFilter(v[0] as Filter)}
    >
      <ToggleGroupItem value="all">All</ToggleGroupItem>
      <ToggleGroupItem value="unanswered">Unanswered</ToggleGroupItem>
      <ToggleGroupItem value="flagged">Flagged</ToggleGroupItem>
    </ToggleGroup>
  );
}
export function BookletLegend() {
  return (
    <ul className="text-muted-foreground space-y-1 text-xs">
      <li className="flex items-center gap-2">
        <span className="size-3 rounded-full border bg-white" /> Not answered
      </li>
      <li className="flex items-center gap-2">
        <span className="bg-ink size-3 rounded-full" /> Answered
      </li>
      <li className="flex items-center gap-2">
        <Flag aria-hidden className="text-primary fill-primary size-3" />{" "}
        Flagged
      </li>
      <li className="flex items-center gap-2">
        <span className="ring-primary size-3 rounded-full ring-2" /> Current
      </li>
    </ul>
  );
}
export function PaperBooklet({
  progress,
  attempts,
  position,
  busy,
  filter,
  onFilter,
  go,
  onReadAll,
}: {
  progress: Progress;
  attempts: Attempt[];
  position: number;
  busy: boolean;
  filter: Filter;
  onFilter: (v: Filter) => void;
  go: (i: number) => void;
  onReadAll: () => void;
}) {
  return (
    <div className="space-y-3">
      <BookletFilter filter={filter} onFilter={onFilter} />
      <nav aria-label="Question booklet" className="space-y-3">
        {progress.map((section) => (
          <div key={section.name}>
            <h3 className="mb-2 text-sm font-semibold">
              {section.name} · {section.answered}/{section.total} answered ·{" "}
              {section.marks} marks
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {section.units.map((unit) => {
                const flagged = attempts.some(
                  (r) => unit.positions.includes(r.position) && r.flagged,
                );
                if (
                  (filter === "unanswered" && unit.answered) ||
                  (filter === "flagged" && !flagged)
                )
                  return null;
                const current = unit.positions.includes(position);
                return (
                  <button
                    key={unit.positions.join("/")}
                    type="button"
                    data-q
                    disabled={busy}
                    aria-current={current ? "step" : undefined}
                    aria-label={`Question ${unit.positions.join("/")}: ${unit.answered ? "Answered" : "Not answered"}${flagged ? ", Flagged" : ""}`}
                    className={cn(
                      "relative h-9 rounded-full border px-3 text-sm font-medium tabular-nums",
                      unit.answered
                        ? "bg-ink border-ink text-white"
                        : "bg-white",
                      current && "ring-primary ring-2 ring-offset-2",
                    )}
                    onClick={() =>
                      go(
                        attempts.findIndex(
                          (r) => r.position === unit.positions[0],
                        ),
                      )
                    }
                  >
                    {unit.positions.join("/")}
                    {flagged && (
                      <Flag
                        aria-hidden
                        className="text-primary fill-primary absolute -top-1 -right-1 size-3.5"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <BookletLegend />
      <Button variant="outline" size="sm" onClick={onReadAll}>
        Read all questions
      </Button>
    </div>
  );
}
export function PaperChoiceDraft({
  unit,
  position,
  busy,
  attempts,
  go,
}: {
  unit: Unit;
  position: number;
  busy: boolean;
  attempts: Attempt[];
  go: (i: number) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="font-semibold">
        Answer ONE: {unit.positions.map((p) => `Question ${p}`).join(" or ")}
      </p>
      <ToggleGroup
        aria-label="Choose question to draft"
        className="flex-wrap"
        disabled={busy}
        value={[String(position)]}
        onValueChange={(v) => {
          const i = attempts.findIndex((r) => r.position === Number(v[0]));
          if (i >= 0) go(i);
        }}
      >
        {unit.positions.map((p) => (
          <ToggleGroupItem key={p} value={String(p)}>
            Question {p}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
export function PaperChoiceFinish({
  units,
  sections,
  attempts,
  choices,
  onChoice,
}: {
  units: Unit[];
  sections: PaperSection[];
  attempts: Attempt[];
  choices: Record<string, number>;
  onChoice: (group: number, position: number) => void;
}) {
  return units
    .filter(
      (u) =>
        attempts.filter((r) => u.positions.includes(r.position) && answered(r))
          .length > 1,
    )
    .map((u) => {
      const group = sections.find(
        (s) => s.position === u.positions[0],
      )!.choice_group!;
      return (
        <fieldset key={group} className="space-y-2">
          <legend id={`choice-${group}`} className="font-semibold">
            Which one should we mark?
          </legend>
          <RadioGroup
            aria-labelledby={`choice-${group}`}
            value={choices[group] == null ? null : String(choices[group])}
            onValueChange={(v) => onChoice(group, Number(v))}
          >
            {u.positions.map((p) => (
              <div key={p} className="flex min-h-11 items-center gap-3">
                <RadioGroupItem id={`mark-${group}-${p}`} value={String(p)} />
                <Label htmlFor={`mark-${group}-${p}`}>Question {p}</Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
      );
    });
}
