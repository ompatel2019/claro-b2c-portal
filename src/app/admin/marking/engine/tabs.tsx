"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function EngineTabs({ tab }: { tab: "docs" | "runs" }) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <ToggleGroup
      aria-label="Engine tabs"
      value={[tab]}
      variant="outline"
      onValueChange={(values) => {
        const next = values[0];
        if (!next || next === tab) return;
        const query = new URLSearchParams(params.toString());
        query.set("tab", next);
        router.push(`/admin/marking/engine?${query}`);
      }}
    >
      <ToggleGroupItem value="docs">Docs</ToggleGroupItem>
      <ToggleGroupItem value="runs">Eval runs</ToggleGroupItem>
    </ToggleGroup>
  );
}
