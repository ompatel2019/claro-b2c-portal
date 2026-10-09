import { Card } from "@/components/ui/card";
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading student" className="space-y-4">
      <div className="bg-muted h-8 w-64 animate-pulse rounded" />
      <div className="bg-muted h-4 w-full animate-pulse rounded" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="bg-muted h-28 animate-pulse" />
        ))}
      </div>
      <Card className="bg-muted h-52 animate-pulse" />
      <div className="bg-muted h-9 w-full animate-pulse rounded" />
      <Card className="bg-muted h-80 animate-pulse" />
    </div>
  );
}
