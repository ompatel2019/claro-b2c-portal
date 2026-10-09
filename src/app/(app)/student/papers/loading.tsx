import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading papers"
      className="space-y-4"
    >
      <div className="bg-muted h-16 animate-pulse rounded-lg" />
      <div className="bg-muted h-14 animate-pulse rounded-lg" />
      <Card className="p-5">
        <div className="bg-muted h-56 animate-pulse rounded-lg" />
      </Card>
    </div>
  );
}
