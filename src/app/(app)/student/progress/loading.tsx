import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div className="space-y-4" aria-label="Loading progress" aria-busy="true">
      <Skeleton className="h-16 w-64" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-5">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-44 w-full" />
        </Card>
      ))}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-48 w-full" />
            </Card>
          ))}
        </div>
        <Card className="p-5">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-48 w-full" />
        </Card>
      </div>
      <Card className="p-5">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-56 w-full" />
      </Card>
    </div>
  );
}
