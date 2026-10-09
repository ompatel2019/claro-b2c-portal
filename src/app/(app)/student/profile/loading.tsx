import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-[720px] min-w-0 space-y-4"
      aria-label="Loading profile"
      aria-busy="true"
    >
      <Skeleton className="h-9 w-40" />
      {["h-80", "h-64", "h-48", "h-48", "h-16"].map((height, i) => (
        <Card key={i} className="p-5">
          <Skeleton className="h-6 w-36" />
          <Skeleton className={`${height} w-full`} />
        </Card>
      ))}
    </div>
  );
}
