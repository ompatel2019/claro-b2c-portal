"use client";
import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PROGRESS_RANGES, type ProgressRange } from "@/lib/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

export function ProgressControls({
  range,
  filters = false,
}: {
  range: ProgressRange;
  filters?: boolean;
}) {
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const [pending, startTransition] = useTransition();
  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "all" && key !== "range") next.delete(key);
    else next.set(key, value);
    startTransition(() =>
      router.replace(`${pathname}?${next}`, { scroll: false }),
    );
  }
  if (!filters)
    return (
      <div aria-busy={pending}>
        <Select
          items={PROGRESS_RANGES}
          disabled={pending}
          value={range}
          onValueChange={(v) => v && update("range", v)}
        >
          <SelectTrigger aria-label="Progress range" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROGRESS_RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  const groups = [
    {
      key: "kind",
      label: "Session kind",
      options: [
        ["all", "All"],
        ["sprint", "Sprints"],
        ["single", "Mark my answer"],
      ],
    },
    {
      key: "type",
      label: "Question type",
      options: [
        ["all", "All types"],
        ["mcq", "MC"],
        ["short", "Short"],
        ["extended", "Extended"],
      ],
    },
  ];
  const active = groups.filter((g) =>
    g.options.some(([value]) => value !== "all" && value === params.get(g.key)),
  ).length;
  return (
    <div className="space-y-2" aria-busy={pending}>
      {groups.map((g) => (
        <ToggleGroup
          key={g.key}
          variant="outline"
          size="sm"
          className="max-w-full flex-wrap"
          aria-label={g.label}
          disabled={pending}
          value={[
            g.options.some(([value]) => value === params.get(g.key))
              ? params.get(g.key)!
              : "all",
          ]}
          onValueChange={(v) => v[0] && update(g.key, v[0])}
        >
          {g.options.map(([value, label]) => (
            <ToggleGroupItem key={value} value={value}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ))}
      {active > 0 && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            groups.forEach((g) => next.delete(g.key));
            startTransition(() =>
              router.replace(`${pathname}${next.size ? `?${next}` : ""}`, {
                scroll: false,
              }),
            );
          }}
        >
          Clear ({active})
        </Button>
      )}
    </div>
  );
}
