import { Card } from "@/components/ui/card";
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading papers" className="space-y-4">
      <div className="bg-muted h-8 w-40 animate-pulse rounded" />
      <Card className="bg-muted h-96 animate-pulse" />
    </div>
  );
}
