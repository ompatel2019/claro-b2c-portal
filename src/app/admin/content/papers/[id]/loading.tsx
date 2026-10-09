import { Card } from "@/components/ui/card";
export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading paper builder"
      className="space-y-4"
    >
      <div className="bg-muted h-8 w-48 animate-pulse rounded" />
      <Card className="bg-muted h-72 animate-pulse" />
      {[1, 2, 3, 4].map((n) => (
        <Card key={n} className="bg-muted h-24 animate-pulse" />
      ))}
    </div>
  );
}
