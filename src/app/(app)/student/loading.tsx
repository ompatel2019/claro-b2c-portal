import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      aria-label="Loading home"
      aria-busy="true"
      className="min-w-0 space-y-4"
    >
      <Skeleton className="h-16 w-full max-w-64" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-52 w-full rounded-2xl" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        {[0, 1].map((i) => (
          <Card key={i} className="min-w-0 p-5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-48 w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}
