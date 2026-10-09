"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Range } from "./data";

const ranges = [7, 30, 90].map((n) => ({
  value: String(n),
  label: `${n} days`,
}));
export function RangeSelect({ range }: { range: Range }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <Select
      items={ranges}
      value={String(range)}
      onValueChange={(value) => {
        if (!value) return;
        const next = new URLSearchParams(params);
        next.set("range", value);
        router.push(`${pathname}?${next}`);
      }}
    >
      <SelectTrigger aria-label="Date range" className="w-32">
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
  );
}
