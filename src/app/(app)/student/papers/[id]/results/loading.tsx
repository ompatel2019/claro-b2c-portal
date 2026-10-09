import { Card } from "@/components/ui/card";
export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading paper results"
      className="space-y-4"
    >
      <div
        aria-hidden="true"
        className="bg-muted h-20 w-full animate-pulse rounded"
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-5">
            <div
              aria-hidden="true"
              className="bg-muted h-5 w-2/3 animate-pulse rounded"
            />
            <div
              aria-hidden="true"
              className="bg-muted h-9 w-full animate-pulse rounded"
            />
          </Card>
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-5">
          <div
            aria-hidden="true"
            className="bg-muted h-6 w-1/3 animate-pulse rounded"
          />
          <div
            aria-hidden="true"
            className="bg-muted h-40 w-full animate-pulse rounded"
          />
        </Card>
      ))}
    </div>
  );
}
