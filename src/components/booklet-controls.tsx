"use client";
import { Flag } from "@/components/icons";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
type Filter = "all" | "unanswered" | "flagged";
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
