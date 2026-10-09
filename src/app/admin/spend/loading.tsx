import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading AI spend"
      className="min-w-0 space-y-4"
    >
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      {[60, 64, 64, 64, 72].map((height, i) => (
        <Card key={i}>
          <CardContent className="space-y-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton
              className="w-full"
              style={{ height: `${height / 4}rem` }}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
