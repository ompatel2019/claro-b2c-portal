import { Card } from "@/components/ui/card";
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading questions" className="space-y-4">
      <div className="bg-muted h-8 w-40 animate-pulse rounded" />
      <div className="bg-muted h-9 w-96 max-w-full animate-pulse rounded" />
      <div className="bg-muted h-9 w-2/3 animate-pulse rounded" />
      <Card className="bg-muted h-96 animate-pulse" />
    </div>
  );
}
