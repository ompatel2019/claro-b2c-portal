import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading flashcards" className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-5 w-72 max-w-full" />
      <Skeleton className="h-9 w-72 max-w-full" />
      <Skeleton className="h-9 w-2/3" />
      <Card className="p-5">
        <Skeleton className="h-80" />
      </Card>
    </div>
  );
}
