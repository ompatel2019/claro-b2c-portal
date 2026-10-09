"use client";
import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Range } from "./data";

const ranges = [
  { value: "month", label: "This month" },
  { value: "30", label: "Last 30 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
];
export function RangeSelect({ range }: { range: Range }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(
    typeof range === "object" ? "custom" : range,
  );
  const [from, setFrom] = useState(typeof range === "object" ? range.from : "");
  const [to, setTo] = useState(typeof range === "object" ? range.to : "");
  const navigate = (preset: string) => {
    const next = new URLSearchParams(params);
    for (const key of ["range", "from", "to"]) next.delete(key);
    if (preset !== "month") next.set("range", preset);
    if (preset === "custom") {
      next.set("from", from);
      next.set("to", to);
    }
    router.push(`${pathname}${next.size ? `?${next}` : ""}`);
  };
  return (
    <div className="flex min-w-0 flex-wrap items-end gap-2">
      <Select
        items={ranges}
        value={value}
        onValueChange={(next) => {
          if (!next) return;
          setValue(next);
          if (next !== "custom") navigate(next);
        }}
      >
        <SelectTrigger aria-label="Date range" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ranges.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value === "custom" && (
        <form
          className="flex min-w-0 flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            navigate("custom");
          }}
        >
          <label className="text-muted-foreground text-xs">
            From
            <Input
              type="date"
              required
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-36"
            />
          </label>
          <label className="text-muted-foreground text-xs">
            To
            <Input
              type="date"
              required
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-36"
            />
          </label>
          <Button type="submit" variant="outline">
            Apply
          </Button>
        </form>
      )}
    </div>
  );
}
