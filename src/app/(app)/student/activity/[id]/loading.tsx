import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading Mark my answer"
      className="space-y-4"
    >
      <Skeleton className="bg-muted h-16 animate-pulse rounded-lg" />
      <Skeleton className="bg-muted h-14 animate-pulse rounded-lg" />
      <Card className="p-5">
        <Skeleton className="bg-muted h-56 animate-pulse rounded-lg" />
      </Card>
    </div>
  );
}
