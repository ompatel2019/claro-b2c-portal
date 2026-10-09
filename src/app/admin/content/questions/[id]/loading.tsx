import { Card } from "@/components/ui/card";
export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading question"
      className="grid min-w-0 gap-4 xl:grid-cols-2"
    >
      <div className="space-y-4">
        <Card className="bg-muted h-80 animate-pulse" />
        <Card className="bg-muted h-80 animate-pulse" />
      </div>
      <Card className="bg-muted h-96 animate-pulse" />
    </div>
  );
}
