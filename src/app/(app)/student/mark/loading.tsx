import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading Mark my answer"
      className="mx-auto max-w-3xl space-y-4"
    >
      <Skeleton className="bg-muted h-16 animate-pulse rounded-lg" />

      {["Question", "Your answer"].map((label) => (
        <Card key={label} className="p-5">
          <Skeleton className="bg-muted h-6 w-32 animate-pulse rounded-lg" />
          <Skeleton className="bg-muted mt-4 h-56 animate-pulse rounded-lg" />
        </Card>
      ))}
      <Card className="p-5">
        <Skeleton className="bg-muted h-9 animate-pulse rounded-lg" />
      </Card>
      <Card className="p-5">
        <Skeleton className="bg-muted h-6 w-32 animate-pulse rounded-lg" />
        <Skeleton className="bg-muted mt-4 h-24 animate-pulse rounded-lg" />
      </Card>
    </div>
  );
}
